import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, createPreparedRunState, finalizeAttempt, setAttemptPaused } from "@/lib/run-state";
import { needsRunReplacementConfirmation, replaceRunTransaction } from "@/lib/studio/run-replacement";

function buildRun(seed: string, nowMs = 0) {
  return buildPuzzleRun({
    mode: "custom",
    seed,
    topics: ["myth", "cosmos", "greek"],
    puzzleSize: 7,
    boardView: "crossword",
    timerEnabled: true,
  }, nowMs);
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

test("successful replacement settles outgoing progress and persists one candidate before commit", async () => {
  const current = createAttemptFromRun(buildRun("outgoing"), 1_000, "attempt-outgoing");
  const progress = createEmptyProgress();
  const writes: Array<{ attemptId: string; historyIds: string[]; nowMs: number }> = [];

  const result = await replaceRunTransaction({
    current,
    progress,
    buildRun: (transitionNowMs) => buildRun("candidate", transitionNowMs),
    persist: async (candidate, nextProgress, nowMs) => {
      writes.push({
        attemptId: candidate.attemptId,
        historyIds: nextProgress.history.map((entry) => entry.attemptId),
        nowMs,
      });
      return { ok: true, saveId: "save-replacement-0001", bytes: 1 };
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
  assert.equal(result.state.run.createdAt, new Date(5_000).toISOString());
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
    persist: async () => { throw new Error("persistence must not run"); },
    expectedWrites: 0,
  },
  {
    name: "persistence denial",
    reason: "persistence-failed" as const,
    buildRun: () => buildRun("denied-candidate"),
    persist: async () => ({ ok: false as const, code: "write-denied" as const, stage: "primary" as const, preservation: "unchanged" as const, retryable: true }),
    expectedWrites: 1,
  },
  {
    name: "persistence exception",
    reason: "persistence-failed" as const,
    buildRun: () => buildRun("throwing-candidate"),
    persist: async () => { throw new Error("quota"); },
    expectedWrites: 1,
  },
]) {
  test(`${scenario.name} returns the exact source state without a partial commit`, async () => {
    const current = createAttemptFromRun(buildRun("source"), 1_000, "attempt-source");
    const progress = createEmptyProgress();
    let writes = 0;

    const result = await replaceRunTransaction({
      current,
      progress,
      buildRun: scenario.buildRun,
      persist: async () => {
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
