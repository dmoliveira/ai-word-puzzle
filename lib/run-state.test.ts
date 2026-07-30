import assert from "node:assert/strict";
import test from "node:test";
import { getRunTargetCells } from "@/lib/puzzle-board";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import {
  canAcceptPlayIntent,
  canMutateAttempt,
  buildAssistRecap,
  createAttemptFromRun,
  createPreparedRunState,
  finalizeAttempt,
  getAssistCount,
  getDisplayedElapsedMs,
  isStartedAttempt,
  recordAnagram,
  recordHintStep,
  recordPuzzleReveal,
  recordRevealedCell,
  recordWordReveal,
  resumeStoredAttempt,
  setAttemptPaused,
  setAttemptVisibility,
  snapshotAttempt,
  startPreparedAttempt,
} from "@/lib/run-state";

function createState(nowMs = 1_000) {
  const run = buildPuzzleRun({
    mode: "custom",
    seed: "run-state-tests",
    topics: ["myth", "cosmos", "greek"],
    puzzleSize: 4,
    timerEnabled: true,
  });
  return createAttemptFromRun(run, nowMs, `attempt-${nowMs}`);
}

test("prepared puzzles have no attempt identity, timestamps, or active clock", () => {
  const prepared = createPreparedRunState(createState().run);

  assert.equal(prepared.attemptId, null);
  assert.equal(prepared.startedAt, null);
  assert.equal(prepared.completedAt, null);
  assert.equal(prepared.elapsedMs, 0);
  assert.equal(prepared.lastTickAt, null);
  assert.equal(isStartedAttempt(prepared), false);
  assert.equal(canAcceptPlayIntent(prepared), true);
});

test("starting a prepared puzzle uses the supplied identity and clock exactly once", () => {
  const prepared = {
    ...createPreparedRunState(createState().run),
    activeWordId: createState().run.words[1].id,
  };
  const started = startPreparedAttempt(prepared, 12_345, "attempt-explicit");

  assert.equal(started.attemptId, "attempt-explicit");
  assert.equal(started.startedAt, new Date(12_345).toISOString());
  assert.equal(started.lastTickAt, 12_345);
  assert.equal(started.activeWordId, prepared.activeWordId);
  assert.equal(isStartedAttempt(started), true);
  assert.equal(startPreparedAttempt(started, 99_999, "attempt-replacement"), started);
});

test("attempt identity is separate from deterministic puzzle identity", () => {
  const run = createState().run;
  const first = createAttemptFromRun(run, 1_000, "attempt-one");
  const second = createAttemptFromRun(run, 2_000, "attempt-two");

  assert.equal(first.run.puzzleId, second.run.puzzleId);
  assert.notEqual(first.attemptId, second.attemptId);
});

test("active timing uses clock deltas and excludes pause, hidden, and offline time", () => {
  const active = createState(1_000);
  assert.equal(getDisplayedElapsedMs(active, 6_000), 5_000);

  const paused = setAttemptPaused(active, true, 6_000);
  assert.equal(paused.elapsedMs, 5_000);
  assert.equal(getDisplayedElapsedMs(paused, 20_000), 5_000);

  const resumed = setAttemptPaused(paused, false, 20_000);
  assert.equal(getDisplayedElapsedMs(resumed, 22_500), 7_500);

  const hidden = setAttemptVisibility(resumed, false, 22_500);
  assert.equal(hidden.elapsedMs, 7_500);
  assert.equal(getDisplayedElapsedMs(hidden, 40_000, false), 7_500);

  const visible = setAttemptVisibility(hidden, true, 40_000);
  assert.equal(getDisplayedElapsedMs(visible, 41_000), 8_500);
  assert.equal(getDisplayedElapsedMs(visible, 39_000), 7_500, "clock rollback must never subtract time");
});

test("serialized snapshots settle active time and resume without counting offline time", () => {
  const state = createState(1_000);
  const snapshot = snapshotAttempt(state, 4_000);

  assert.equal(snapshot.elapsedMs, 3_000);
  assert.equal(snapshot.lastTickAt, null);

  const resumed = resumeStoredAttempt(snapshot, 20_000);
  assert.equal(getDisplayedElapsedMs(resumed, 21_000), 4_000);
});

test("assist ledger is bounded, deduplicated, and blocked while paused", () => {
  const initial = createState();
  const wordId = initial.run.words[0].id;
  const cell = getRunTargetCells(initial.run)[0];
  const cellKey = `${cell.row}:${cell.col}`;
  let assisted = initial;

  for (let index = 0; index < 5; index += 1) {
    assisted = recordHintStep(assisted, wordId);
  }
  assisted = recordRevealedCell(recordRevealedCell(assisted, cellKey), cellKey);
  assisted = recordAnagram(recordAnagram(assisted, wordId), wordId);
  assisted = recordWordReveal(recordWordReveal(assisted, wordId), wordId);
  assisted = recordPuzzleReveal(recordPuzzleReveal(assisted));

  assert.equal(assisted.assists.hintStepsByWord[wordId], 3);
  assert.deepEqual(assisted.assists.revealedCellKeys, [cellKey]);
  assert.deepEqual(assisted.assists.anagramWordIds, [wordId]);
  assert.deepEqual(assisted.assists.revealedWordIds, [wordId]);
  assert.equal(assisted.assists.puzzleRevealed, true);
  assert.equal(getAssistCount(assisted), 7);

  const paused = setAttemptPaused(assisted, true, 2_000);
  assert.equal(recordHintStep(paused, initial.run.words[1].id), paused);
  assert.equal(canMutateAttempt(paused), false);
});

test("assist recap keeps global events separate from deterministic per-word attribution", () => {
  const initial = createState();
  const crossing = getRunTargetCells(initial.run).find((cell) => cell.wordIds.length === 2)!;
  const crossingKey = `${crossing.row}:${crossing.col}`;
  const hintedWord = initial.run.words[0].id;
  const assisted = recordRevealedCell(recordHintStep(initial, hintedWord), crossingKey);
  const recap = buildAssistRecap(assisted);

  assert.equal(recap.global.total, 2, "one hint step and one revealed cell are two global assists");
  assert.deepEqual(recap.words.map((word) => word.wordId), initial.run.words.map((word) => word.id));
  assert.equal(recap.words.reduce((total, word) => total + word.hintSteps + word.revealedLetters, 0), 3, "one crossing reveal is attributed to both affected words");
  assert.equal(recap.affectedWordCount, new Set([hintedWord, ...crossing.wordIds]).size);
  assert.equal(recap.unaffectedWordCount, initial.run.words.length - recap.affectedWordCount);

  const fullyRevealed = buildAssistRecap(recordPuzzleReveal(assisted));
  assert.equal(fullyRevealed.global.total, 3, "full-puzzle reveal remains one global assist");
  assert.equal(fullyRevealed.affectedWordCount, initial.run.words.length);
  assert.ok(fullyRevealed.words.every((word) => word.puzzleRevealed));
});

test("completion timestamp and elapsed time are immutable", () => {
  const state = createState(1_000);
  const solved = {
    ...state,
    solvedIds: state.run.words.map((word) => word.id),
  };
  const completed = finalizeAttempt(solved, 8_000);
  const repeated = finalizeAttempt(completed, 20_000);

  assert.equal(completed.completedAt, new Date(8_000).toISOString());
  assert.equal(completed.elapsedMs, 7_000);
  assert.equal(completed.lastTickAt, null);
  assert.equal(repeated, completed);
  assert.equal(canMutateAttempt(completed), false);
  assert.equal(recordPuzzleReveal(completed), completed);
});
