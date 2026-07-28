import assert from "node:assert/strict";
import test from "node:test";
import { buildConnectedCrossword, buildQuestBoard } from "@/lib/board-generator";
import type { PuzzleWord } from "@/lib/game-types";
import { wordBank } from "@/lib/word-bank";

test("connected crossword builder rejects a disconnected exact-size request", () => {
  const base = wordBank.find((word) => word.qualityStatus === "approved")!;
  const candidates = ["aaaa", "bbbb", "cccc", "dddd"].map((answer, index): PuzzleWord => ({
    ...base,
    id: `disconnected-${index}`,
    answer,
    normalized: answer,
    length: answer.length,
    clue: `Synthetic fixture ${index}`,
  }));

  assert.equal(buildConnectedCrossword(candidates, 4, "disconnected"), null);
});

test("quest board places every selected target exactly once", () => {
  const words = wordBank
    .filter((word, index, entries) => word.length <= 14 && entries.findIndex((entry) => entry.normalized === word.normalized) === index)
    .slice(0, 12);
  const board = buildQuestBoard(words, "quest-board");

  assert.equal(board.size, 14);
  assert.equal(board.placements.length, words.length);
  assert.equal(new Set(board.placements.map((placement) => placement.row)).size, words.length);
  assert.ok(board.placements.every((placement) => placement.direction === "across"));
  assert.ok(board.cells.every((cell) => cell.row >= 0 && cell.row < 14 && cell.col >= 0 && cell.col < 14));
});
