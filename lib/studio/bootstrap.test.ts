import assert from "node:assert/strict";
import test from "node:test";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { parseSharedOptions } from "@/lib/puzzle-options";
import { createEmptyProgress } from "@/lib/progress";
import { createAttemptFromRun, isStartedAttempt } from "@/lib/run-state";
import { refreshPreparedDaily, resolveStudioBootstrap } from "@/lib/studio/bootstrap";
import type { StoredGameResult } from "@/lib/session-storage";

const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
const none: StoredGameResult = { game: null, source: "none" };

function storedAttempt(completedAt: string | null = null): StoredGameResult {
  const currentAttempt = {
    ...createAttemptFromRun(buildPuzzleRun({
      mode: "custom",
      seed: "saved-bootstrap",
      topics: ["myth", "cosmos", "greek"],
      puzzleSize: 4,
      boardView: "crossword",
    }), nowMs - 10_000, "attempt-saved"),
    completedAt,
  };
  return {
    source: "v2",
    game: { schemaVersion: 2, currentAttempt, progress: createEmptyProgress() },
  };
}

test("a clean boot prepares the browser UTC daily without starting it", () => {
  const result = resolveStudioBootstrap({ stored: none, shared: { kind: "none" }, nowMs });

  assert.equal(result.source, "current-daily");
  assert.equal(result.current.run.seed, "daily:2026-07-29");
  assert.equal(result.current.attemptId, null);
  assert.equal(result.current.startedAt, null);
  assert.equal(result.progress.history.length, 0);
});

test("a valid shared puzzle is prepared only when there is no restorable save", () => {
  const shared = parseSharedOptions("?generatorVersion=3&mode=custom&seed=shared-bootstrap&topics=myth,cosmos,greek&challenge=quest&puzzleFamily=classic&contentPackId=auto&boardView=crossword&style=alpha&puzzleSize=4&timerEnabled=true&learningMode=false", nowMs);
  assert.equal(shared.kind, "valid");
  const result = resolveStudioBootstrap({ stored: none, shared, nowMs });

  assert.equal(result.source, "shared");
  assert.equal(result.current.run.seed, "shared-bootstrap");
  assert.equal(result.current.attemptId, null);
});

test("an unfinished saved attempt wins over valid or invalid shared intent", () => {
  const valid = parseSharedOptions("?mode=custom&seed=ignored-share&topics=myth,cosmos,greek&puzzleSize=4", nowMs);
  const restoredValid = resolveStudioBootstrap({ stored: storedAttempt(), shared: valid, nowMs });
  const restoredInvalid = resolveStudioBootstrap({ stored: storedAttempt(), shared: { kind: "invalid", reason: "bad" }, nowMs });

  assert.equal(restoredValid.source, "stored");
  assert.equal(restoredValid.current.attemptId, "attempt-saved");
  assert.match(restoredValid.warning ?? "", /shared puzzle link was not opened/i);
  assert.equal(restoredInvalid.current.attemptId, "attempt-saved");
  assert.match(restoredInvalid.warning ?? "", /invalid/i);
});

test("a completed custom save yields to a prepared current daily without mutation", () => {
  const stored = storedAttempt(new Date(nowMs - 1_000).toISOString());
  const before = structuredClone(stored.game);
  const result = resolveStudioBootstrap({ stored, shared: { kind: "none" }, nowMs });

  assert.equal(result.source, "current-daily");
  assert.equal(result.current.attemptId, null);
  assert.deepEqual(stored.game, before);
});

test("a hidden boot restores an attempt without starting its active clock", () => {
  const result = resolveStudioBootstrap({ stored: storedAttempt(), shared: { kind: "none" }, nowMs, visible: false });

  assert.equal(isStartedAttempt(result.current), true);
  assert.equal(result.current.lastTickAt, null);
});

test("only an untouched current-daily preparation rolls to a new UTC day", () => {
  const prepared = resolveStudioBootstrap({ stored: none, shared: { kind: "none" }, nowMs });
  const nextDay = Date.parse("2026-07-30T00:00:01.000Z");
  const refreshed = refreshPreparedDaily(prepared.current, prepared.source, nextDay);
  const shared = { ...prepared.current, run: buildPuzzleRun({ ...prepared.current.run.options, mode: "custom", seed: "fixed" }) };

  assert.equal(refreshed.run.seed, "daily:2026-07-30");
  assert.equal(refreshPreparedDaily(shared, "shared", nextDay), shared);
});
