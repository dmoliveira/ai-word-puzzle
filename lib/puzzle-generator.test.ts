import assert from "node:assert/strict";
import test from "node:test";
import { buildPuzzleRun, createHintLadder, sanitizeGuess } from "@/lib/puzzle-generator";
import { contentCatalog } from "@/lib/word-bank";

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

test("breeze runs avoid rare entries", () => {
  const run = buildPuzzleRun({
    challenge: "breeze",
    topics: ["myth", "cosmos", "winter"],
    puzzleSize: 8,
  });

  assert.equal(run.words.some((word) => word.frequencyBand === "rare"), false);
});

test("quest runs keep rare entries limited", () => {
  const run = buildPuzzleRun({
    challenge: "quest",
    topics: ["myth", "cosmos", "desert"],
    puzzleSize: 8,
  });

  assert.ok(run.words.filter((word) => word.frequencyBand === "rare").length <= 1);
});

test("mini family clamps puzzle size to a tighter run", () => {
  const run = buildPuzzleRun({
    puzzleFamily: "mini",
    puzzleSize: 9,
    topics: ["city", "winter"],
  });

  assert.equal(run.options.puzzleFamily, "mini");
  assert.equal(run.options.puzzleSize, 6);
  assert.ok(run.words.every((word) => word.length <= 8));
});

test("themed family keeps answers inside the selected content pack", () => {
  const run = buildPuzzleRun({
    puzzleFamily: "themed",
    contentPackId: "ocean-life",
    topics: ["ocean"],
    puzzleSize: 6,
    challenge: "quest",
  });

  assert.equal(run.options.contentPackId, "ocean-life");
  assert.ok(run.words.length >= 5);
  assert.ok(run.words.every((word) => word.contentPackIds.includes("ocean-life")));
});

test("non-themed families ignore explicit content pack filters", () => {
  const run = buildPuzzleRun({
    puzzleFamily: "classic",
    contentPackId: "ocean-life",
    topics: ["ocean", "city"],
    puzzleSize: 6,
  });

  assert.equal(run.options.puzzleFamily, "classic");
  assert.equal(run.options.contentPackId, "auto");
  assert.ok(run.words.some((word) => word.topicId === "city" || word.contentPackIds.length === 0));
});

test("themed family stays themed when supported topics have curated packs", () => {
  const run = buildPuzzleRun({
    puzzleFamily: "themed",
    topics: ["greek"],
    contentPackId: "auto",
    puzzleSize: 6,
  });

  assert.equal(run.options.puzzleFamily, "themed");
  assert.ok(run.words.every((word) => word.contentPackIds.length > 0));
});

test("content catalog now covers a broader set of curated lanes", () => {
  assert.ok(contentCatalog.length >= 24);
});

test("themed auto selection rotates across packs for different seeds", () => {
  const titles = new Set(
    ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06"].map((seed) =>
      buildPuzzleRun({ puzzleFamily: "themed", mode: "daily", seed, topics: ["myth", "ocean", "winter"] }).title,
    ),
  );

  assert.ok(titles.size >= 2);
});

test("classic auto selection gains seeded featured-lane variety", () => {
  const titles = new Set(
    ["seed-a", "seed-b", "seed-c", "seed-d", "seed-e"].map((seed) =>
      buildPuzzleRun({ puzzleFamily: "classic", seed, topics: ["city", "winter", "ocean"], puzzleSize: 7 }).title,
    ),
  );

  assert.ok(titles.size >= 2);
});
