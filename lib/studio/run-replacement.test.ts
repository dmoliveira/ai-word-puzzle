import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, createPreparedRunState, finalizeAttempt, setAttemptPaused } from "@/lib/run-state";
import { needsRunReplacementConfirmation, replaceRunTransaction } from "@/lib/studio/run-replacement";

function buildRun(seed: string) {
  return buildPuzzleRun({
    mode: "custom",
    seed,
    topics: ["myth", "cosmos", "greek"],
    puzzleSize: 7,
    boardView: "crossword",
    timerEnabled: true,
  });
}

test("only unfinished started attempts require replacement confirmation", () => {
  const prepared = createPreparedRunState(buildRun("prepared"));
  const started = createAttemptFromRun(buildRun("started"), 1_000, "attempt-started");
  const paused = setAttemptPaused(started, true, 2_000);
  const completed = finalizeAttempt({ ...started, solvedIds: started.run.words.map((word) => word.id) }, 3_000);

  assert.equal(needsRunReplacementConfirmation(prepared), false);
  assert.equal(needsRunReplacementConfirmation(started), true);
  assert.equal(needsRunReplacementConfirmation(paused), true);
  assert.equal(needsRunReplacementConfirmation(completed), false);
});

test("successful replacement settles outgoing progress and persists one candidate before commit", () => {
  const current = createAttemptFromRun(buildRun("outgoing"), 1_000, "attempt-outgoing");
  const progress = createEmptyProgress();
  const writes: Array<{ attemptId: string; historyIds: string[]; nowMs: number }> = [];

  const result = replaceRunTransaction({
    current,
    progress,
    buildRun: () => buildRun("candidate"),
    persist: (candidate, nextProgress, nowMs) => {
      writes.push({
        attemptId: candidate.attemptId,
        historyIds: nextProgress.history.map((entry) => entry.attemptId),
        nowMs,
      });
      return true;
    },
    nowMs: 5_000,
    attemptId: "attempt-candidate",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(writes, [{
    attemptId: "attempt-candidate",
    historyIds: ["attempt-candidate", "attempt-outgoing"],
    nowMs: 5_000,
  }]);
  assert.equal(result.state.attemptId, "attempt-candidate");
  assert.equal(result.state.startedAt, new Date(5_000).toISOString());
  assert.equal(result.outgoing?.elapsedMs, 4_000);
  assert.equal(result.outgoing?.lastTickAt, null);
  assert.equal(current.lastTickAt, 1_000, "the source attempt stays untouched");
  assert.equal(progress.history.length, 0, "the source progress stays untouched");
});

for (const scenario of [
  {
    name: "generation failure",
    reason: "generation-failed" as const,
    buildRun: () => { throw new Error("generation denied"); },
    persist: () => { throw new Error("persistence must not run"); },
    expectedWrites: 0,
  },
  {
    name: "persistence denial",
    reason: "persistence-failed" as const,
    buildRun: () => buildRun("denied-candidate"),
    persist: () => false,
    expectedWrites: 1,
  },
  {
    name: "persistence exception",
    reason: "persistence-failed" as const,
    buildRun: () => buildRun("throwing-candidate"),
    persist: () => { throw new Error("quota"); },
    expectedWrites: 1,
  },
]) {
  test(`${scenario.name} returns the exact source state without a partial commit`, () => {
    const current = createAttemptFromRun(buildRun("source"), 1_000, "attempt-source");
    const progress = createEmptyProgress();
    let writes = 0;

    const result = replaceRunTransaction({
      current,
      progress,
      buildRun: scenario.buildRun,
      persist: () => {
        writes += 1;
        return scenario.persist();
      },
      nowMs: 5_000,
      attemptId: "attempt-never-committed",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, scenario.reason);
    assert.equal(result.state, current);
    assert.equal(result.progress, progress);
    assert.equal(writes, scenario.expectedWrites);
  });
}
