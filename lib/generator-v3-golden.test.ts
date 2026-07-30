import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PuzzleOptions, PuzzlePlacement } from "@/lib/game-types";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { buildQuestPuzzleRun } from "@/lib/quest-puzzle-generator";
import { parseSharedOptions } from "@/lib/puzzle-options";
import { isPuzzleBoardV3 } from "@/lib/puzzle-board";

type GeneratorV3Golden = {
  name: string;
  input: PuzzleOptions;
  expected: {
    generatorVersion: 3;
    puzzleId: string;
    seed: string;
    wordIds: string[];
    placements: PuzzlePlacement[];
    boardDigest: string;
  };
};

const goldens = JSON.parse(
  readFileSync(new URL("./fixtures/generator-v3-goldens.json", import.meta.url), "utf8"),
) as GeneratorV3Golden[];

function digestBoard(board: ReturnType<typeof buildPuzzleRun>["board"]) {
  return createHash("sha256").update(JSON.stringify(board)).digest("hex");
}

function buildV3(options: PuzzleOptions) {
  return options.boardView === "quest"
    ? buildQuestPuzzleRun(options, Date.now(), { generatorVersion: 3 })
    : buildPuzzleRun(options, Date.now(), { generatorVersion: 3 });
}

function toSharedSearch(options: PuzzleOptions, includeVersion = true) {
  const params = new URLSearchParams({
    mode: options.mode,
    seed: options.seed,
    topics: options.topics.join(","),
    challenge: options.challenge,
    puzzleFamily: options.puzzleFamily,
    contentPackId: options.contentPackId,
    boardView: options.boardView,
    style: options.style,
    puzzleSize: String(options.puzzleSize),
    timerEnabled: String(options.timerEnabled),
    learningMode: String(options.learningMode),
  });
  if (includeVersion) params.set("generatorVersion", "3");
  return `?${params}`;
}

for (const golden of goldens) {
  test(`generator v3 golden remains exact: ${golden.name}`, () => {
    const run = buildV3(golden.input);

    assert.equal(run.generatorVersion, golden.expected.generatorVersion);
    assert.equal(run.puzzleId, golden.expected.puzzleId);
    assert.equal(run.seed, golden.expected.seed);
    assert.deepEqual(run.words.map((word) => word.id), golden.expected.wordIds);
    assert.ok(isPuzzleBoardV3(run.board));
    assert.deepEqual(run.board.placements, golden.expected.placements);
    assert.equal(digestBoard(run.board), golden.expected.boardDigest);
  });

  test(`generator v3 shared options reproduce: ${golden.name}`, () => {
    const parsed = parseSharedOptions(toSharedSearch(golden.input), Date.parse("2030-06-15T12:00:00.000Z"));
    assert.equal(parsed.kind, "valid");
    if (parsed.kind !== "valid") return;

    const run = parsed.options.boardView === "quest"
      ? buildQuestPuzzleRun(parsed.options, Date.now(), { generatorVersion: parsed.generatorVersion })
      : buildPuzzleRun(parsed.options, Date.now(), { generatorVersion: parsed.generatorVersion });
    assert.equal(run.puzzleId, golden.expected.puzzleId);
    assert.equal(digestBoard(run.board), golden.expected.boardDigest);
  });
}

test("an unversioned legacy share remains generator v3", () => {
  const golden = goldens.find((candidate) => candidate.name === "custom-quest-classic")!;
  const parsed = parseSharedOptions(toSharedSearch(golden.input, false), Date.parse("2030-06-15T12:00:00.000Z"));
  assert.equal(parsed.kind, "valid");
  if (parsed.kind !== "valid") return;

  const run = buildQuestPuzzleRun(parsed.options, Date.now(), { generatorVersion: parsed.generatorVersion });
  assert.equal(run.generatorVersion, 3);
  assert.equal(run.puzzleId, golden.expected.puzzleId);
  assert.equal(digestBoard(run.board), golden.expected.boardDigest);
});
