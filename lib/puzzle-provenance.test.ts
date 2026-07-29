import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PuzzleOptions, PuzzleRun } from "@/lib/game-types";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { currentCorpusRevision, hasVerifiedPuzzleProvenance, materializeQuestV3Grid } from "@/lib/puzzle-provenance";

type Golden = { name: string; input: PuzzleOptions };
type ProvenanceGolden = { name: string; puzzleFingerprint: string };

const runs = JSON.parse(readFileSync(new URL("./fixtures/generator-v3-goldens.json", import.meta.url), "utf8")) as Golden[];
const fingerprints = JSON.parse(readFileSync(new URL("./fixtures/generator-v3-provenance.json", import.meta.url), "utf8")) as ProvenanceGolden[];

for (const expected of fingerprints) {
  test(`generator v3 provenance remains exact: ${expected.name}`, () => {
    const input = runs.find((candidate) => candidate.name === expected.name)!.input;
    const run = buildPuzzleRun(input, Date.parse("2030-06-15T12:00:00.000Z"));
    assert.equal(run.corpusRevision, currentCorpusRevision);
    assert.equal(run.fingerprintVersion, 1);
    assert.equal(run.puzzleFingerprint, expected.puzzleFingerprint);
    assert.equal(hasVerifiedPuzzleProvenance(run), true);
  });
}

test("presentation preferences and generation time do not affect puzzle fingerprint", () => {
  const input = runs.find((candidate) => candidate.name === "custom-crossword-classic")!.input;
  const first = buildPuzzleRun(input, 1_000);
  const second = buildPuzzleRun({ ...input, style: "sunforge", timerEnabled: !input.timerEnabled, learningMode: !input.learningMode }, 9_000);

  assert.equal(first.puzzleId, second.puzzleId);
  assert.equal(first.puzzleFingerprint, second.puzzleFingerprint);
  assert.notEqual(first.createdAt, second.createdAt);
});

test("v3 Quest provenance includes the complete materialized display grid", () => {
  const input = runs.find((candidate) => candidate.name === "custom-quest-classic")!.input;
  const run = buildPuzzleRun(input);
  const grid = materializeQuestV3Grid(run.board, run.seed);
  assert.equal(grid.length, 14);
  assert.ok(grid.every((row) => /^[a-z]{14}$/.test(row)));
  const changed = structuredClone(run) as PuzzleRun;
  changed.board.cells[0].solution = changed.board.cells[0].solution === "a" ? "b" : "a";
  assert.equal(hasVerifiedPuzzleProvenance(changed), false);
});
