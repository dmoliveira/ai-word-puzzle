import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun } from "@/lib/run-state";
import { canReplaySummaryExactly, resolveSavedRunReplay } from "@/lib/studio/replay";

const nowMs = Date.parse("2026-07-29T12:00:00.000Z");

function createSummary() {
  const run = buildPuzzleRun({ mode: "custom", seed: "replay-provenance", puzzleSize: 4 }, nowMs);
  const state = createAttemptFromRun(run, nowMs, "attempt-replay");
  return recordRunProgress(createEmptyProgress(), state, nowMs).history[0];
}

test("a matching provenance summary resolves to the exact recorded puzzle", () => {
  const summary = createSummary();
  const replay = resolveSavedRunReplay(summary, nowMs + 1_000);

  assert.equal(canReplaySummaryExactly(summary), true);
  assert.equal(replay.kind, "exact");
  if (replay.kind !== "exact") return;
  assert.equal(replay.run.puzzleId, summary.puzzleId);
  assert.equal(replay.run.puzzleFingerprint, summary.puzzleFingerprint);
});

test("missing or mismatched provenance falls back to current rules without an exact claim", () => {
  const summary = createSummary();
  const legacy = { ...summary, corpusRevision: null, fingerprintVersion: null, puzzleFingerprint: null };
  const mismatch = { ...summary, puzzleFingerprint: `p1-${"0".repeat(64)}` };

  assert.equal(resolveSavedRunReplay(legacy, nowMs).kind, "current-rules");
  assert.equal(resolveSavedRunReplay(mismatch, nowMs).kind, "current-rules");
  assert.equal(canReplaySummaryExactly({ ...mismatch, exactReplay: true } as typeof summary), false);
});

test("presentation preferences remain neutral to exact replay", () => {
  const summary = createSummary();
  const replay = resolveSavedRunReplay({
    ...summary,
    options: { ...summary.options, style: "classic", timerEnabled: false, learningMode: true },
    style: "classic",
  }, nowMs);

  assert.equal(replay.kind, "exact");
});
