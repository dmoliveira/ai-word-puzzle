import assert from "node:assert/strict";
import test from "node:test";
import type { PuzzleOptions, PuzzleRun } from "@/lib/game-types";
import { crosswordContentPackIds, crosswordTopicIds, getEditorialClueCount } from "@/lib/clue-catalog";
import { buildPuzzleRun, createHintLadder, PuzzleGenerationError, sanitizeGuess, scoreDifficultyMatch } from "@/lib/puzzle-generator";
import { contentCatalog, topicCatalog, wordBank } from "@/lib/word-bank";
import { isPuzzleBoardV3, isQuestV4Board } from "@/lib/puzzle-board";
import { certifyQuestV4Board } from "@/lib/quest-v4-engine";

const challenges = ["breeze", "quest", "mythic"] as const;
const matrixSeedCount = Number(process.env.GENERATOR_MATRIX_SEEDS ?? 4);

function getPlacementCells(run: PuzzleRun, wordId: string) {
  assert.ok(isPuzzleBoardV3(run.board));
  const word = run.words.find((candidate) => candidate.id === wordId)!;
  const placement = run.board.placements.find((candidate) => candidate.wordId === wordId)!;
  return Array.from({ length: word.length }, (_, index) => ({
    row: placement.row + (placement.direction === "down" ? index : 0),
    col: placement.col + (placement.direction === "across" ? index : 0),
    letter: word.answer[index],
  }));
}

function assertCrosswordInvariants(run: PuzzleRun) {
  assert.ok(isPuzzleBoardV3(run.board));
  const board = run.board;
  assert.equal(run.generatorVersion, 3);
  assert.equal(run.words.length, run.options.puzzleSize);
  assert.equal(board.placements.length, run.options.puzzleSize);
  assert.equal(new Set(run.words.map((word) => word.normalized)).size, run.words.length);
  assert.ok(run.words.every((word) => run.options.topics.includes(word.topicId)));
  assert.ok(run.words.every((word) => word.qualityStatus === "approved" && word.clue));
  for (const clueWord of run.words) {
    const clueTokens = clueWord.clue!.toLowerCase().split(/[^a-z]+/);
    assert.ok(run.words.every((targetWord) => !clueTokens.includes(targetWord.normalized)), "a clue must not name another answer in the run");
  }
  assert.ok(board.size <= 17);
  assert.deepEqual(new Set(board.placements.map((placement) => placement.direction)), new Set(["across", "down"]));

  const graph = new Map(run.words.map((word) => [word.id, new Set<string>()]));
  for (const cell of board.cells) {
    if (cell.wordIds.length > 1) {
      const directions = cell.wordIds.map((wordId) => board.placements.find((placement) => placement.wordId === wordId)!.direction);
      assert.equal(new Set(directions).size, directions.length, "crossing words must be perpendicular");
      for (const left of cell.wordIds) {
        for (const right of cell.wordIds) {
          if (left !== right) {
            graph.get(left)!.add(right);
          }
        }
      }
    }
  }

  const visited = new Set<string>();
  const pending = [run.words[0].id];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    pending.push(...graph.get(current)!);
  }
  assert.equal(visited.size, run.words.length, "crossword placement graph must be connected");

  for (const word of run.words) {
    const cells = getPlacementCells(run, word.id);
    assert.equal(cells.map((cell) => board.cells.find((boardCell) => boardCell.row === cell.row && boardCell.col === cell.col)?.solution).join(""), word.answer);
  }
}

test("certified crossword matrix returns exact, connected, clue-safe boards", () => {
  const topicSubsets = Array.from({ length: 15 }, (_, maskIndex) => {
    const mask = maskIndex + 1;
    return crosswordTopicIds.filter((_, index) => (mask & (1 << index)) !== 0);
  });

  for (const topics of topicSubsets) {
    for (const challenge of challenges) {
      for (const puzzleSize of [4, 6, 8]) {
        for (let seedIndex = 0; seedIndex < matrixSeedCount; seedIndex += 1) {
          const run = buildPuzzleRun({
            mode: "custom",
            seed: `matrix-${topics.join("-")}-${challenge}-${puzzleSize}-${seedIndex}`,
            topics: [...topics],
            challenge,
            puzzleSize,
            boardView: "crossword",
          });
          assertCrosswordInvariants(run);
        }
      }
    }
  }
});

test("each certified themed pack satisfies every crossword challenge and size", () => {
  for (const contentPackId of crosswordContentPackIds) {
    const pack = contentCatalog.find((candidate) => candidate.id === contentPackId)!;
    for (const challenge of challenges) {
      for (const puzzleSize of [4, 5, 6]) {
        for (let seedIndex = 0; seedIndex < matrixSeedCount; seedIndex += 1) {
          const run = buildPuzzleRun({
            mode: "custom",
            seed: `pack-${contentPackId}-${challenge}-${puzzleSize}-${seedIndex}`,
            topics: [pack.topicId],
            challenge,
            puzzleFamily: "themed",
            contentPackId,
            puzzleSize,
            boardView: "crossword",
          });
          assertCrosswordInvariants(run);
          assert.ok(run.words.every((word) => word.topicId === pack.topicId && word.contentPackIds.includes(contentPackId)));
        }
      }
    }
  }
});

test("daily generation is deterministic across representative calendar seeds", () => {
  for (const seed of ["2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31"]) {
    const options: Partial<PuzzleOptions> = { mode: "daily", seed, topics: ["myth", "cosmos", "greek"], puzzleSize: 7, boardView: "crossword" };
    const left = buildPuzzleRun(options);
    const right = buildPuzzleRun(options);

    assert.equal(left.puzzleId, right.puzzleId);
    assert.deepEqual(left.words.map((word) => word.id), right.words.map((word) => word.id));
    assert.deepEqual(left.board, right.board);
    assertCrosswordInvariants(left);
  }
});

test("trace-path mode preserves the broad topic catalog with exact 14×14 boards", () => {
  for (const topic of topicCatalog) {
    const run = buildPuzzleRun({
      mode: "custom",
      seed: `trace-${topic.id}`,
      topics: [topic.id],
      puzzleSize: 6,
      boardView: "quest",
    });

    assert.equal(run.words.length, 6);
    assert.ok(isQuestV4Board(run.board));
    assert.equal(run.generatorVersion, 4);
    assert.equal(run.board.paths.length, 6);
    assert.equal(run.board.size, 14);
    assert.equal(run.puzzleId, run.board.fingerprint);
    assert.equal(certifyQuestV4Board(run.board, run.words.map((word) => ({ id: word.id, answer: word.normalized }))).ok, true);
    assert.equal(new Set(run.words.map((word) => word.normalized)).size, 6);
    assert.ok(run.words.every((word) => word.topicId === topic.id));
  }
});

test("every content pack is certified or fails explicitly without a v3 fallback", () => {
  const explicitFailures: string[] = [];
  for (const pack of contentCatalog) {
    const puzzleSize = Math.min(12, pack.answers.length);
    try {
      const run = buildPuzzleRun({
        mode: "custom",
        seed: `trace-pack-${pack.id}`,
        topics: [pack.topicId],
        puzzleFamily: "themed",
        contentPackId: pack.id,
        puzzleSize,
        boardView: "quest",
      });
      assert.ok(isQuestV4Board(run.board));
      assert.equal(run.words.length, puzzleSize);
      assert.ok(run.words.every((word) => word.topicId === pack.topicId && word.contentPackIds.includes(pack.id)));
    } catch (error) {
      assert.ok(error instanceof PuzzleGenerationError);
      assert.equal(error.code, "certification-failed");
      assert.equal(error.questFailureCode, "unavoidable-duplicate");
      explicitFailures.push(pack.id);
    }
  }
  assert.deepEqual(explicitFailures, ["winter-weather", "greek-symbols"]);
});

test("unsupported crossword options fail explicitly instead of mutating the request", () => {
  assert.throws(
    () => buildPuzzleRun({ topics: ["city"], boardView: "crossword", puzzleSize: 6 }),
    (error: unknown) => error instanceof PuzzleGenerationError && error.code === "unsupported-content",
  );
  assert.throws(
    () => buildPuzzleRun({ topics: ["myth"], boardView: "crossword", puzzleSize: 9 }),
    (error: unknown) => error instanceof PuzzleGenerationError && error.code === "unsupported-content",
  );
  assert.throws(
    () => buildPuzzleRun({ puzzleFamily: "themed", contentPackId: "ocean-life", topics: ["myth"], puzzleSize: 6 }),
    (error: unknown) => error instanceof PuzzleGenerationError && error.code === "unsupported-content",
  );
});

test("content-pack membership is scoped by owning topic", () => {
  const signals = wordBank.filter((word) => word.normalized === "signal" && ["cosmos", "city", "invent"].includes(word.topicId));
  assert.ok(signals.length >= 3);
  for (const signal of signals) {
    const packTopics = signal.contentPackIds.map((packId) => contentCatalog.find((pack) => pack.id === packId)!.topicId);
    assert.ok(packTopics.every((topicId) => topicId === signal.topicId));
  }
});

test("crossword catalog is editorial while broad trace content remains available", () => {
  assert.equal(getEditorialClueCount(), 54);
  assert.equal(new Set(wordBank.filter((word) => word.qualityStatus === "approved").map((word) => `${word.topicId}:${word.normalized}`)).size, 52, "two-letter Greek entries stay out of the playable bank");
  assert.ok(wordBank.length >= 2_500, "trace mode retains the extended local lexicon");
  assert.ok(wordBank.some((word) => word.source === "synthetic"));
});

test("exact challenge match scores above adjacent and distant entries", () => {
  assert.ok(scoreDifficultyMatch("quest", "quest") > scoreDifficultyMatch("breeze", "quest"));
  assert.ok(scoreDifficultyMatch("breeze", "quest") > scoreDifficultyMatch("breeze", "mythic"));
});

test("hints, clue copy, and theme copy keep the answer gated", () => {
  const run = buildPuzzleRun({ topics: ["greek"], puzzleSize: 4, boardView: "crossword" });
  const hints = createHintLadder(run.words[0]);
  assert.equal(hints.length, 4);
  assert.match(hints[0], /letters/);
  assert.equal(hints[3], run.words[0].answer.toUpperCase());
  for (const word of run.words) {
    assert.equal(run.blurb.toLowerCase().includes(word.answer.toLowerCase()), false);
    assert.equal(word.prompt, word.clue);
  }
});

test("sanitizeGuess strips punctuation and case", () => {
  assert.equal(sanitizeGuess(" Alpha-7! "), "alpha");
});
