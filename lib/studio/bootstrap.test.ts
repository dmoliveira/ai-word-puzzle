import assert from "node:assert/strict";
import test from "node:test";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { parseSharedOptions } from "@/lib/puzzle-options";
import { createEmptyProgress } from "@/lib/progress";
import { createAttemptFromRun, isStartedAttempt } from "@/lib/run-state";
import { refreshPreparedDaily, resolveStudioBootstrap, resolveStudioBootstrapAsync } from "@/lib/studio/bootstrap";
import type { StoredGameResult } from "@/lib/session-storage";

const nowMs = Date.parse("2026-07-29T12:00:00.000Z");
const none: StoredGameResult = {
  currentAttempt: null,
  progress: createEmptyProgress(),
  source: "none",
  committedSaveId: null,
  adopted: false,
  writable: true,
  issues: [],
};

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
    source: "v3-primary",
    currentAttempt,
    progress: createEmptyProgress(),
    committedSaveId: "save-bootstrap-0001",
    adopted: true,
    writable: true,
    issues: [],
  };
}

test("a clean boot prepares the browser UTC daily without starting it", () => {
  const result = resolveStudioBootstrap({ stored: none, shared: { kind: "none" }, nowMs });

  assert.equal(result.source, "current-daily");
  assert.equal(result.current.run.seed, "daily:2026-07-29");
  assert.equal(result.current.run.createdAt, new Date(nowMs).toISOString());
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

test("a shared Quest is loaded lazily only after stored-attempt precedence is resolved", async () => {
  const shared = parseSharedOptions("?generatorVersion=3&mode=custom&seed=shared-quest&topics=story&challenge=mythic&puzzleFamily=classic&contentPackId=auto&boardView=quest&style=alpha&puzzleSize=6&timerEnabled=true&learningMode=false", nowMs);
  assert.equal(shared.kind, "valid");

  const restored = await resolveStudioBootstrapAsync({ stored: storedAttempt(), shared, nowMs });
  assert.equal(restored.source, "stored");
  assert.equal(restored.current.attemptId, "attempt-saved");

  const opened = await resolveStudioBootstrapAsync({ stored: none, shared, nowMs });
  assert.equal(opened.source, "shared");
  assert.equal(opened.current.run.generatorVersion, 3);
  assert.equal(opened.current.run.options.boardView, "quest");
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

test("a provenance-bearing shared mismatch fails visibly before replacement", () => {
  const shared = parseSharedOptions(`?generatorVersion=3&corpusRevision=word-bank-r1&fingerprintVersion=1&puzzleFingerprint=p1-${"0".repeat(64)}&mode=custom&seed=shared-bootstrap&topics=myth,cosmos,greek&challenge=quest&puzzleFamily=classic&contentPackId=auto&boardView=crossword&style=alpha&puzzleSize=4&timerEnabled=true&learningMode=false`, nowMs);
  assert.equal(shared.kind, "valid");

  const result = resolveStudioBootstrap({ stored: none, shared, nowMs });

  assert.equal(result.source, "current-daily");
  assert.match(result.warning ?? "", /fingerprint.*nothing was replaced/i);
});

test("a completed custom save yields to a prepared current daily without mutation", () => {
  const stored = storedAttempt(new Date(nowMs - 1_000).toISOString());
  const before = structuredClone(stored);
  const result = resolveStudioBootstrap({ stored, shared: { kind: "none" }, nowMs });

  assert.equal(result.source, "current-daily");
  assert.equal(result.current.attemptId, null);
  assert.deepEqual(stored, before);
});

test("a hidden boot restores an attempt without starting its active clock", () => {
  const result = resolveStudioBootstrap({ stored: storedAttempt(), shared: { kind: "none" }, nowMs, visible: false });

  assert.equal(isStartedAttempt(result.current), true);
  assert.equal(result.current.lastTickAt, null);
});

test("only an untouched current-daily preparation rolls to a new UTC day", () => {
  const prepared = resolveStudioBootstrap({ stored: none, shared: { kind: "none" }, nowMs });
  const nextDay = Date.parse("2026-07-30T00:00:00.000Z");
  const refreshed = refreshPreparedDaily(prepared.current, prepared.source, nextDay);
  const shared = { ...prepared.current, run: buildPuzzleRun({ ...prepared.current.run.options, mode: "custom", seed: "fixed" }) };

  assert.equal(refreshed.run.seed, "daily:2026-07-30");
  assert.equal(refreshed.run.createdAt, new Date(nextDay).toISOString());
  assert.equal(refreshPreparedDaily(shared, "shared", nextDay), shared);
});
