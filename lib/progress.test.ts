import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyArchive, createEmptyProgress, decodeProgressSnapshot, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { getCanonicalDailyOptions } from "@/lib/puzzle-options";
import { createAttemptFromRun, finalizeAttempt, recordHintStep, recordRevealedCell } from "@/lib/run-state";

function createCompletedDaily(day: string, completedAtMs: number, attemptId: string) {
  const run = buildPuzzleRun({ ...getCanonicalDailyOptions(Date.parse(`${day}T12:00:00Z`)), seed: day });
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
  const afterFirst = recordRunProgress(createEmptyProgress(), first, Date.parse("2026-04-24T12:00:00Z"));
  const repeatedFirst = recordRunProgress(afterFirst, first, Date.parse("2026-04-24T12:00:00Z"));
  const afterSecond = recordRunProgress(repeatedFirst, second, Date.parse("2026-04-25T12:00:00Z"));
  const repeatedSecond = recordRunProgress(afterSecond, second, Date.parse("2026-04-25T12:00:00Z"));

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
  assert.equal(decoded.history[0].canonicalDaily, false);
  assert.equal(decoded.history[0].assists.total, 0);
});

test("daily archive prefers a completion over newer unfinished retries", () => {
  const day = "2026-04-24";
  const completed = createCompletedDaily(day, Date.parse("2026-04-24T12:00:00Z"), "completed-attempt");
  const completedSnapshot = recordRunProgress(createEmptyProgress(), completed, Date.parse("2026-04-24T12:00:00Z"));
  const retryRun = buildPuzzleRun({ ...getCanonicalDailyOptions(Date.parse("2026-04-24T12:00:00Z")), seed: day });
  const retry = createAttemptFromRun(retryRun, Date.parse("2026-04-24T13:00:00Z"), "newer-retry");
  const withRetry = recordRunProgress(completedSnapshot, retry, Date.parse("2026-04-24T13:00:00Z"));
  const archive = buildDailyArchive(withRetry.history, 1, Date.parse("2026-04-24T18:00:00Z"));

  assert.equal(withRetry.history[0].attemptId, "newer-retry");
  assert.equal(archive[0].summary?.attemptId, "completed-attempt");
  assert.equal(archive[0].summary?.finished, true);
});

test("noncanonical daily links never earn streak credit", () => {
  const completedAt = Date.parse("2026-04-24T12:00:00Z");
  const run = buildPuzzleRun({ mode: "daily", seed: "2026-04-24", topics: ["myth"], puzzleSize: 4 });
  const state = createAttemptFromRun(run, completedAt - 5_000, "modified-daily");
  const completed = finalizeAttempt({ ...state, solvedIds: run.words.map((word) => word.id) }, completedAt);
  const snapshot = recordRunProgress(createEmptyProgress(), completed, completedAt);

  assert.equal(snapshot.streak, 0);
  assert.equal(snapshot.history[0].canonicalDaily, false);
});

test("a daily completed after its UTC seed day stays outside streaks and archive", () => {
  const day = "2026-04-24";
  const run = buildPuzzleRun({ ...getCanonicalDailyOptions(Date.parse(`${day}T23:59:00Z`)), seed: day });
  const started = createAttemptFromRun(run, Date.parse(`${day}T23:59:00Z`), "midnight-crossing");
  const completedAt = Date.parse("2026-04-25T00:01:00Z");
  const completed = finalizeAttempt({ ...started, solvedIds: run.words.map((word) => word.id) }, completedAt);
  const snapshot = recordRunProgress(createEmptyProgress(), completed, completedAt);

  assert.equal(snapshot.streak, 0);
  assert.equal(snapshot.history[0].canonicalDaily, false);
  assert.equal(buildDailyArchive(snapshot.history, 2, completedAt)[1].summary, null);
});

test("streaks expire after a gap while best streak remains truthful", () => {
  const first = createCompletedDaily("2026-04-24", Date.parse("2026-04-24T12:00:00Z"), "day-one");
  const second = createCompletedDaily("2026-04-25", Date.parse("2026-04-25T12:00:00Z"), "day-two");
  const afterGap = createCompletedDaily("2026-04-27", Date.parse("2026-04-27T12:00:00Z"), "day-four");
  let snapshot = recordRunProgress(createEmptyProgress(), first, Date.parse("2026-04-24T12:00:00Z"));
  snapshot = recordRunProgress(snapshot, second, Date.parse("2026-04-25T12:00:00Z"));
  snapshot = recordRunProgress(snapshot, afterGap, Date.parse("2026-04-27T12:00:00Z"));

  assert.equal(snapshot.streak, 1);
  assert.equal(snapshot.bestStreak, 2);
});

test("history stores a finite assist breakdown and elapsed time", () => {
  const run = buildPuzzleRun({ mode: "custom", seed: "assist-history", puzzleSize: 4 });
  let state = createAttemptFromRun(run, 1_000, "assisted-attempt");
  state = recordHintStep(state, run.words[0].id);
  const cell = run.board.cells[0];
  state = recordRevealedCell(state, `${cell.row}:${cell.col}`);
  const snapshot = recordRunProgress(createEmptyProgress(), { ...state, elapsedMs: 4_200 }, 5_200);

  assert.equal(snapshot.history[0].assists.total, 2);
  assert.equal(snapshot.history[0].assists.hintSteps, 1);
  assert.equal(snapshot.history[0].assists.revealedLetters, 1);
  assert.equal(snapshot.history[0].elapsedMs, 4_200);
});
