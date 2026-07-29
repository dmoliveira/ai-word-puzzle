import assert from "node:assert/strict";
import test from "node:test";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, recordRevealedCell } from "@/lib/run-state";
import { applyCellEntry, applyWordEntry, clearWordEntries, deriveGuessFromCells, getPlacementCells } from "@/lib/studio/attempt-entries";

function crossingFixture() {
  const state = createAttemptFromRun(buildPuzzleRun({
    mode: "custom",
    seed: "crossing-transactions",
    topics: ["myth", "cosmos", "greek"],
    puzzleSize: 7,
    boardView: "crossword",
  }), 1_000, "attempt-crossings");
  const crossing = state.run.board.cells.find((cell) => cell.wordIds.length === 2)!;
  const [firstId, secondId] = crossing.wordIds;
  const first = state.run.words.find((word) => word.id === firstId)!;
  const second = state.run.words.find((word) => word.id === secondId)!;
  const secondPlacement = state.run.board.placements.find((placement) => placement.wordId === secondId)!;
  const crossingIndex = getPlacementCells(state, secondPlacement).findIndex((cell) => cell.row === crossing.row && cell.col === crossing.col);
  return { state, crossing, first, second, crossingIndex };
}

test("an unsolved crossing keeps its slot and updates both word lanes", () => {
  const { state, crossing, first, second, crossingIndex } = crossingFixture();
  const result = applyCellEntry(state, crossing.row, crossing.col, crossing.solution, first.id);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(deriveGuessFromCells(result.state, second.id)[crossingIndex], crossing.solution);
  assert.equal(deriveGuessFromCells(result.state, second.id).length, crossingIndex + 1);
  assert.equal(deriveGuessFromCells(result.state, first.id).includes(crossing.solution), true);
});

test("a conflicting whole-word edit is atomic after a crossing word is solved", () => {
  const { state, crossing, first, second, crossingIndex } = crossingFixture();
  const solved = applyWordEntry(state, first.id, first.answer);
  assert.equal(solved.ok, true);
  if (!solved.ok) return;
  assert.ok(solved.state.solvedIds.includes(first.id));

  const conflicting = [...second.answer];
  conflicting[0] = conflicting[0] === "z" ? "y" : "z";
  conflicting[crossingIndex] = crossing.solution === "z" ? "y" : "z";
  const before = structuredClone(solved.state);
  const rejected = applyWordEntry(solved.state, second.id, conflicting.join(""));

  assert.deepEqual(rejected, { ok: false, state: before, reason: "locked-cell-conflict" });
  assert.deepEqual(solved.state, before);
});

test("clearing a neighboring word preserves a solved crossing", () => {
  const { state, crossing, first, second } = crossingFixture();
  const solved = applyWordEntry(state, first.id, first.answer);
  assert.equal(solved.ok, true);
  if (!solved.ok) return;
  const filledNeighbor = applyWordEntry(solved.state, second.id, second.answer);
  assert.equal(filledNeighbor.ok, true);
  if (!filledNeighbor.ok) return;

  const cleared = clearWordEntries(filledNeighbor.state, second.id);
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.state.cellEntries[`${crossing.row}:${crossing.col}`], crossing.solution);
  assert.ok(cleared.state.solvedIds.includes(first.id));
});

test("direct edits cannot clear or overwrite a solved crossing", () => {
  const { state, crossing, first } = crossingFixture();
  const solved = applyWordEntry(state, first.id, first.answer);
  assert.equal(solved.ok, true);
  if (!solved.ok) return;

  assert.equal(applyCellEntry(solved.state, crossing.row, crossing.col, "", first.id).ok, false);
  assert.equal(applyCellEntry(solved.state, crossing.row, crossing.col, crossing.solution === "z" ? "y" : "z", first.id).ok, false);
  assert.equal(applyCellEntry(solved.state, crossing.row, crossing.col, crossing.solution, first.id).ok, true);
});

test("a whole-word conflict cannot overwrite a deliberately revealed cell", () => {
  const { state, first } = crossingFixture();
  const placement = state.run.board.placements.find((entry) => entry.wordId === first.id)!;
  const [revealedCell] = getPlacementCells(state, placement);
  const revealedKey = `${revealedCell.row}:${revealedCell.col}`;
  const entered = applyCellEntry(state, revealedCell.row, revealedCell.col, revealedCell.solution, first.id);
  assert.equal(entered.ok, true);
  if (!entered.ok) return;
  const assisted = recordRevealedCell(entered.state, revealedKey);
  const conflicting = [...first.answer];
  conflicting[0] = revealedCell.solution === "z" ? "y" : "z";
  const before = structuredClone(assisted);

  const rejected = applyWordEntry(assisted, first.id, conflicting.join(""));

  assert.deepEqual(rejected, { ok: false, state: before, reason: "locked-cell-conflict" });
  assert.deepEqual(assisted, before);
});
