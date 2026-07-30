import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { buildQuestPuzzleRun } from "@/lib/quest-puzzle-generator";
import { createAttemptFromRun } from "@/lib/run-state";
import { canReplaySummaryExactly, resolveSavedRunReplay } from "@/lib/studio/replay";

const nowMs = Date.parse("2026-07-29T12:00:00.000Z");

function createSummary() {
  const run = buildPuzzleRun({ mode: "custom", seed: "replay-provenance", puzzleSize: 4 }, nowMs);
  const state = createAttemptFromRun(run, nowMs, "attempt-replay");
  return recordRunProgress(createEmptyProgress(), state, nowMs).history[0];
}

function createQuestV4Summary() {
  const run = buildQuestPuzzleRun({ mode: "custom", seed: "trace-myth", topics: ["myth"], puzzleSize: 6, boardView: "quest" }, nowMs);
  const state = createAttemptFromRun(run, nowMs, "attempt-replay-v4");
  return recordRunProgress(createEmptyProgress(), state, nowMs).history[0];
}

test("a matching provenance summary resolves to the exact recorded puzzle", async () => {
  const summary = createSummary();
  const replay = await resolveSavedRunReplay(summary, nowMs + 1_000);

  assert.equal(canReplaySummaryExactly(summary), true);
  assert.equal(replay.kind, "exact");
  if (replay.kind !== "exact") return;
  assert.equal(replay.run.puzzleId, summary.puzzleId);
  assert.equal(replay.run.puzzleFingerprint, summary.puzzleFingerprint);
});

test("missing provenance uses current rules while mismatched exact provenance stays unavailable", async () => {
  const summary = createSummary();
  const legacy = { ...summary, corpusRevision: null, fingerprintVersion: null, puzzleFingerprint: null };
  const mismatch = { ...summary, puzzleFingerprint: `p1-${"0".repeat(64)}` };

  assert.equal((await resolveSavedRunReplay(legacy, nowMs)).kind, "current-rules");
  assert.equal((await resolveSavedRunReplay(mismatch, nowMs)).kind, "unavailable-exact");
  assert.equal(canReplaySummaryExactly({ ...mismatch, exactReplay: true } as typeof summary), false);
});

test("presentation preferences remain neutral to exact replay", async () => {
  const summary = createSummary();
  const replay = await resolveSavedRunReplay({
    ...summary,
    options: { ...summary.options, style: "classic", timerEnabled: false, learningMode: true },
    style: "classic",
  }, nowMs);

  assert.equal(replay.kind, "exact");
});

test("Quest v4 provenance replays the exact q4 board", async () => {
  const summary = createQuestV4Summary();
  const replay = await resolveSavedRunReplay(summary, nowMs + 1_000);
  assert.equal(summary.generatorVersion, 4);
  assert.equal(replay.kind, "exact");
  if (replay.kind !== "exact") return;
  assert.equal(replay.run.puzzleId, summary.puzzleId);
  assert.equal(replay.run.generatorVersion, 4);
});

test("an aborted Quest replay cannot return a stale verified run", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(resolveSavedRunReplay(createQuestV4Summary(), nowMs, controller.signal), /superseded/);
});
