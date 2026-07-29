import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PuzzleOptions, PuzzleRun } from "@/lib/game-types";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { currentCorpusRevision, hasVerifiedPuzzleProvenance, materializeQuestV3Grid } from "@/lib/puzzle-provenance";
import { isPuzzleBoardV3 } from "@/lib/puzzle-board";

type Golden = { name: string; input: PuzzleOptions };
type ProvenanceGolden = { name: string; puzzleFingerprint: string };

const runs = JSON.parse(readFileSync(new URL("./fixtures/generator-v3-goldens.json", import.meta.url), "utf8")) as Golden[];
const fingerprints = JSON.parse(readFileSync(new URL("./fixtures/generator-v3-provenance.json", import.meta.url), "utf8")) as ProvenanceGolden[];

for (const expected of fingerprints) {
  test(`generator v3 provenance remains exact: ${expected.name}`, () => {
    const input = runs.find((candidate) => candidate.name === expected.name)!.input;
    const run = buildPuzzleRun(input, Date.parse("2030-06-15T12:00:00.000Z"), { generatorVersion: 3 });
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
  const run = buildPuzzleRun(input, Date.now(), { generatorVersion: 3 });
  assert.ok(isPuzzleBoardV3(run.board));
  const grid = materializeQuestV3Grid(run.board, run.seed);
  assert.equal(grid.length, 14);
  assert.ok(grid.every((row) => /^[a-z]{14}$/.test(row)));
  const changed = structuredClone(run) as PuzzleRun;
  assert.ok(isPuzzleBoardV3(changed.board));
  changed.board.cells[0].solution = changed.board.cells[0].solution === "a" ? "b" : "a";
  assert.equal(hasVerifiedPuzzleProvenance(changed), false);
});

test("Quest v4 freezes independent q4 identity and p1 provenance", () => {
  const run = buildPuzzleRun({ mode: "custom", seed: "trace-myth", topics: ["myth"], puzzleSize: 6, boardView: "quest" }, Date.parse("2030-06-15T12:00:00.000Z"));
  assert.equal(run.generatorVersion, 4);
  assert.equal(run.puzzleId, "q4-e9fe56bf709fa8364549c294c1f87b2c8b2141057566903f8271808f4baa94c1");
  assert.equal(run.puzzleFingerprint, "p1-901ef7ea7e8013959e87fe55154556d52bcdf2e9894e9c00981585d242ec612a");
  assert.equal(hasVerifiedPuzzleProvenance(run), true);
  const presentation = buildPuzzleRun({ ...run.options, style: "classic", timerEnabled: false, learningMode: true }, Date.parse("2040-01-01T00:00:00.000Z"));
  assert.equal(presentation.puzzleId, run.puzzleId);
  assert.equal(presentation.puzzleFingerprint, run.puzzleFingerprint);
});
