import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyArchive, createEmptyProgress, decodeProgressSnapshot, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, finalizeAttempt } from "@/lib/run-state";

function createCompletedDaily(day: string, completedAtMs: number, attemptId: string) {
  const run = buildPuzzleRun({ mode: "daily", seed: day, topics: ["myth", "cosmos", "greek"], puzzleSize: 4 });
  const state = createAttemptFromRun(run, completedAtMs - 5_000, attemptId);
  return finalizeAttempt({ ...state, solvedIds: run.words.map((word) => word.id) }, completedAtMs);
}

test("progress history keys attempts separately from puzzle identity", () => {
  const run = buildPuzzleRun({ mode: "custom", seed: "same-puzzle", puzzleSize: 4 });
  const first = createAttemptFromRun(run, 1_000, "attempt-one");
  const second = createAttemptFromRun(run, 2_000, "attempt-two");
  const snapshot = recordRunProgress(recordRunProgress(createEmptyProgress(), first), second);

  assert.equal(snapshot.history.length, 2);
  assert.deepEqual(snapshot.history.map((entry) => entry.attemptId), ["attempt-two", "attempt-one"]);
  assert.equal(snapshot.history[0].puzzleId, snapshot.history[1].puzzleId);
  assert.equal(snapshot.history[0].runId, run.id);
});

test("daily progress is idempotent and advances only on the next UTC day", () => {
  const first = createCompletedDaily("2026-04-24", Date.parse("2026-04-24T12:00:00Z"), "daily-one");
  const second = createCompletedDaily("2026-04-25", Date.parse("2026-04-25T12:00:00Z"), "daily-two");
  const afterFirst = recordRunProgress(createEmptyProgress(), first);
  const repeatedFirst = recordRunProgress(afterFirst, first);
  const afterSecond = recordRunProgress(repeatedFirst, second);
  const repeatedSecond = recordRunProgress(afterSecond, second);

  assert.equal(afterFirst.streak, 1);
  assert.equal(repeatedFirst.streak, 1);
  assert.equal(afterSecond.streak, 2);
  assert.equal(repeatedSecond.streak, 2);
  assert.equal(repeatedSecond.history.find((entry) => entry.attemptId === "daily-two")?.completedAt, second.completedAt);
});

test("progress decoder migrates legacy summaries and drops malformed entries", () => {
  const run = buildPuzzleRun({ mode: "custom", seed: "legacy-progress", puzzleSize: 4 });
  const decoded = decodeProgressSnapshot({
    streak: 2,
    bestStreak: 3,
    lastDailySeed: null,
    lastCompletedAt: null,
    history: [
      {
        runId: run.id,
        title: run.title,
        seed: run.seed,
        options: run.options,
        solvedCount: 1,
        totalWords: run.words.length,
        finished: false,
        createdAt: run.createdAt,
        completedAt: null,
      },
      { broken: true },
    ],
  });

  assert.ok(decoded);
  assert.equal(decoded.schemaVersion, 2);
  assert.equal(decoded.history.length, 1);
  assert.match(decoded.history[0].attemptId, /^legacy-/);
  assert.equal(decoded.history[0].runId, run.id);
});

test("daily archive prefers a completion over newer unfinished retries", () => {
  const day = "2026-04-24";
  const completed = createCompletedDaily(day, Date.parse("2026-04-24T12:00:00Z"), "completed-attempt");
  const completedSnapshot = recordRunProgress(createEmptyProgress(), completed);
  const retryRun = buildPuzzleRun({ mode: "daily", seed: day, topics: ["myth", "cosmos", "greek"], puzzleSize: 4 });
  const retry = createAttemptFromRun(retryRun, Date.parse("2026-04-24T13:00:00Z"), "newer-retry");
  const withRetry = recordRunProgress(completedSnapshot, retry);
  const archive = buildDailyArchive(withRetry.history, 1, Date.parse("2026-04-24T18:00:00Z"));

  assert.equal(withRetry.history[0].attemptId, "newer-retry");
  assert.equal(archive[0].summary?.attemptId, "completed-attempt");
  assert.equal(archive[0].summary?.finished, true);
});
