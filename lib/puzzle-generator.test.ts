import assert from "node:assert/strict";
import test from "node:test";
import { buildPuzzleRun, createHintLadder, sanitizeGuess } from "@/lib/puzzle-generator";

test("buildPuzzleRun returns requested puzzle size when enough candidates exist", () => {
  const run = buildPuzzleRun({
    challenge: "quest",
    topics: ["cosmos", "myth", "greek"],
    puzzleSize: 8,
    clueDensity: 2,
    style: "alpha",
    timerEnabled: true,
  });

  assert.equal(run.words.length, 8);
});

test("selected topics dominate generated puzzle", () => {
  const run = buildPuzzleRun({
    challenge: "breeze",
    topics: ["ocean"],
    puzzleSize: 6,
    clueDensity: 2,
    style: "nebula",
    timerEnabled: false,
  });

  const oceanWords = run.words.filter((word) => word.topicId === "ocean").length;
  assert.ok(oceanWords >= 4);
});

test("hint ladder reveals length and final answer", () => {
  const run = buildPuzzleRun({ topics: ["greek"], puzzleSize: 4 });
  const hints = createHintLadder(run.words[0]);
  assert.equal(hints.length, 4);
  assert.match(hints[0], /letters/);
  assert.equal(hints[3], run.words[0].answer.toUpperCase());
});

test("theme blurb does not leak exact answer words", () => {
  const run = buildPuzzleRun({ topics: ["garden", "wild"], puzzleSize: 5 });
  for (const word of run.words) {
    assert.equal(run.blurb.toLowerCase().includes(word.answer.toLowerCase()), false);
  }
});

test("sanitizeGuess strips punctuation and case", () => {
  assert.equal(sanitizeGuess(" Alpha-7! "), "alpha");
});

test("daily seeded runs are deterministic", () => {
  const left = buildPuzzleRun({ mode: "daily", seed: "2026-04-22", topics: ["myth", "greek"], puzzleSize: 7 });
  const right = buildPuzzleRun({ mode: "daily", seed: "2026-04-22", topics: ["myth", "greek"], puzzleSize: 7 });

  assert.deepEqual(left.words.map((word) => word.answer), right.words.map((word) => word.answer));
  assert.equal(left.seed, right.seed);
});

test("lexicon scales into the thousands", async () => {
  const { wordBank } = await import("@/lib/word-bank");
  assert.ok(wordBank.length >= 2500);
});

test("new topic packs participate in generation", () => {
  const run = buildPuzzleRun({
    topics: ["desert", "festival", "winter"],
    puzzleSize: 7,
    challenge: "quest",
  });

  assert.ok(run.words.some((word) => word.topicId === "desert" || word.topicId === "festival" || word.topicId === "winter"));
});
