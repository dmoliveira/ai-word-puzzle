import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalDailyOptions, isCanonicalDailyOptions, normalizePuzzleOptions, parseSharedOptions } from "@/lib/puzzle-options";

const now = Date.parse("2026-04-24T12:00:00.000Z");

test("canonical daily options use a stable UTC day and fixed content preset", () => {
  const options = getCanonicalDailyOptions(now);

  assert.equal(options.mode, "daily");
  assert.equal(options.seed, "2026-04-24");
  assert.deepEqual(options.topics, ["myth", "cosmos", "greek"]);
  assert.equal(options.puzzleSize, 7);
});

test("canonical daily identity rejects puzzle changes but allows presentation preferences", () => {
  const options = getCanonicalDailyOptions(now);

  assert.equal(isCanonicalDailyOptions(options, options.seed), true);
  assert.equal(isCanonicalDailyOptions({ ...options, puzzleSize: 6 }, options.seed), false);
  assert.equal(isCanonicalDailyOptions({ ...options, topics: [...options.topics].reverse() }, options.seed), false);
  assert.equal(isCanonicalDailyOptions({ ...options, style: "classic", timerEnabled: false }, options.seed), true);
  assert.equal(isCanonicalDailyOptions(options, "2026-04-25"), false);
});

test("shared options parse supported values without unchecked casts", () => {
  const result = parseSharedOptions(
    "?mode=custom&seed=shared-seed&topics=myth,cosmos&challenge=mythic&puzzleFamily=mini&contentPackId=auto&boardView=quest&style=nebula&puzzleSize=6&timerEnabled=false&learningMode=true",
    now,
  );

  assert.equal(result.kind, "valid");
  if (result.kind === "valid") {
    assert.equal(result.expectedProvenance, null);
    assert.equal(result.options.seed, "shared-seed");
    assert.equal(result.options.puzzleSize, 6);
    assert.equal(result.options.boardView, "quest");
    assert.equal(result.options.timerEnabled, false);
  }
});

test("shared options reject duplicates and malformed values as one candidate", () => {
  assert.equal(parseSharedOptions("?mode=daily&mode=custom&seed=2026-04-24", now).kind, "invalid");
  assert.equal(parseSharedOptions("?mode=daily&seed=not-a-day", now).kind, "invalid");
  assert.equal(parseSharedOptions("?mode=custom&seed=x&timerEnabled=yes", now).kind, "invalid");
  assert.equal(parseSharedOptions("?mode=custom&seed=x&puzzleFamily=mini&puzzleSize=12", now).kind, "invalid");
  assert.equal(parseSharedOptions("?mode=custom&seed=x&topics=myth,unknown", now).kind, "invalid");
  assert.equal(parseSharedOptions("?generatorVersion=2&mode=custom&seed=x", now).kind, "invalid");
  assert.equal(parseSharedOptions("?mode=custom&seed=x&topics=city&boardView=crossword", now).kind, "invalid");
  assert.equal(parseSharedOptions(`?generatorVersion=3&corpusRevision=word-bank-r1&mode=custom&seed=x`, now).kind, "invalid");
  assert.equal(parseSharedOptions(`?generatorVersion=3&corpusRevision=unknown&fingerprintVersion=1&puzzleFingerprint=p1-${"0".repeat(64)}&mode=custom&seed=x`, now).kind, "invalid");
});

test("new shared links parse complete puzzle provenance atomically", () => {
  const fingerprint = `p1-${"a".repeat(64)}`;
  const result = parseSharedOptions(`?generatorVersion=3&corpusRevision=word-bank-r1&fingerprintVersion=1&puzzleFingerprint=${fingerprint}&mode=custom&seed=exact`, now);

  assert.equal(result.kind, "valid");
  if (result.kind !== "valid") return;
  assert.deepEqual(result.expectedProvenance, {
    generatorVersion: 3,
    corpusRevision: "word-bank-r1",
    fingerprintVersion: 1,
    puzzleFingerprint: fingerprint,
  });
});

test("normalization removes invalid topics and clamps mini runs", () => {
  const options = normalizePuzzleOptions({
    mode: "custom",
    seed: "normalized",
    puzzleFamily: "mini",
    puzzleSize: 10,
    topics: ["myth", "myth"],
  }, now);

  assert.equal(options.puzzleSize, 5);
  assert.deepEqual(options.topics, ["myth"]);
});

test("trace-path options retain the broad catalog and larger mini range", () => {
  const options = normalizePuzzleOptions({
    mode: "custom",
    seed: "trace",
    boardView: "quest",
    puzzleFamily: "mini",
    puzzleSize: 10,
    topics: ["city", "winter"],
  }, now);

  assert.equal(options.puzzleSize, 6);
  assert.deepEqual(options.topics, ["city", "winter"]);
});
