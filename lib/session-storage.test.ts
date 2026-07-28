import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, finalizeAttempt } from "@/lib/run-state";
import {
  decodePersistedGame,
  gameStorageKey,
  legacySessionStorageKey,
  readStoredGame,
  shouldRestoreAttempt,
  writeStoredGame,
} from "@/lib/session-storage";

class MemoryStorage {
  readonly values = new Map<string, string>();
  writes = 0;

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.values.set(key, value);
  }
}

function createState(nowMs = 1_000) {
  const run = buildPuzzleRun({ mode: "custom", seed: "storage-tests", puzzleSize: 4, timerEnabled: true });
  return createAttemptFromRun(run, nowMs, "attempt-storage");
}

function createLegacyRaw() {
  const state = createState();
  const { puzzleId: _puzzleId, generatorVersion: _generatorVersion, ...legacyRun } = state.run;
  const legacyWords = state.run.words.map(({
    source: _source,
    qualityStatus: _qualityStatus,
    clue: _clue,
    learningNote: _learningNote,
    plainMeaning: _plainMeaning,
    pronunciationHint: _pronunciationHint,
    usageExample: _usageExample,
    translationAid: _translationAid,
    ...word
  }) => word);
  return JSON.stringify({
    run: { ...legacyRun, words: legacyWords },
    guesses: state.guesses,
    cellEntries: state.cellEntries,
    solvedIds: state.solvedIds,
    activeWordId: state.activeWordId,
    hintLevels: { [state.run.words[0].id]: 2 },
    paused: false,
    elapsedMs: 500,
    lastTickAt: 1_500,
  });
}

test("v2 storage round-trips atomically without serializing an active clock", () => {
  const storage = new MemoryStorage();
  const state = createState(1_000);
  const progress = createEmptyProgress();

  assert.equal(writeStoredGame(storage, state, progress, 4_000), true);
  assert.equal(storage.writes, 1);
  assert.equal(storage.getItem(legacySessionStorageKey), null);

  const loaded = readStoredGame(storage, 20_000);
  assert.equal(loaded.source, "v2");
  assert.ok(loaded.game);
  assert.equal(loaded.game.currentAttempt.attemptId, state.attemptId);
  assert.equal(loaded.game.currentAttempt.elapsedMs, 3_000);
  assert.equal(loaded.game.currentAttempt.lastTickAt, null);
});

test("invalid v2 data falls back to legacy data without mutating legacy keys", () => {
  const storage = new MemoryStorage();
  const legacyRaw = createLegacyRaw();
  storage.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 99 }));
  storage.values.set(legacySessionStorageKey, legacyRaw);

  const loaded = readStoredGame(storage, 5_000);

  assert.equal(loaded.source, "legacy");
  assert.ok(loaded.game);
  assert.equal(loaded.game.currentAttempt.assists.hintStepsByWord[loaded.game.currentAttempt.run.words[0].id], 2);
  assert.equal(storage.getItem(legacySessionStorageKey), legacyRaw);
  assert.equal(storage.writes, 0);
});

test("previous generator-v2 envelopes backfill removed options and word metadata", () => {
  const storage = new MemoryStorage();
  const state = createState();
  const previousWords = state.run.words.map(({ source: _source, qualityStatus: _qualityStatus, clue: _clue, ...word }) => word);
  const { timerEnabled: _timerEnabled, learningMode: _learningMode, ...previousOptions } = state.run.options;
  const previousEnvelope = {
    schemaVersion: 2,
    currentAttempt: {
      ...state,
      run: {
        ...state.run,
        generatorVersion: 2,
        words: previousWords,
        options: { ...previousOptions, clueDensity: 3 },
      },
    },
    progress: createEmptyProgress(),
  };
  const raw = JSON.stringify(previousEnvelope);
  storage.values.set(gameStorageKey, raw);

  const loaded = readStoredGame(storage, 5_000);

  assert.equal(loaded.source, "v2");
  assert.ok(loaded.game);
  assert.equal(loaded.game.currentAttempt.run.generatorVersion, 2);
  assert.equal(loaded.game.currentAttempt.run.options.timerEnabled, true);
  assert.equal(loaded.game.currentAttempt.run.options.learningMode, false);
  assert.ok(loaded.game.currentAttempt.run.words.every((word) => word.source && word.learningNote && "clue" in word));
  assert.equal(storage.getItem(gameStorageKey), raw, "decoding must not overwrite the source envelope");
});

test("malformed persisted candidates are rejected instead of shallow-merged", () => {
  assert.equal(decodePersistedGame("{}"), null);
  assert.equal(decodePersistedGame("not-json"), null);

  const storage = new MemoryStorage();
  storage.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 2, currentAttempt: {}, progress: {} }));
  storage.values.set(legacySessionStorageKey, JSON.stringify({ run: { id: "broken" } }));
  assert.deepEqual(readStoredGame(storage), { game: null, source: "none" });
});

test("boot restoration keeps unfinished attempts and only the matching completed daily", () => {
  const state = createState();
  assert.equal(shouldRestoreAttempt(state, "another-puzzle"), true);

  const completed = finalizeAttempt({ ...state, solvedIds: state.run.words.map((word) => word.id) }, 5_000);
  assert.equal(shouldRestoreAttempt(completed, state.run.puzzleId), true);
  assert.equal(shouldRestoreAttempt(completed, "today-different-puzzle"), false);
});

test("storage write denial is contained", () => {
  const state = createState();
  const deniedStorage = {
    setItem() {
      throw new Error("denied");
    },
  };

  assert.equal(writeStoredGame(deniedStorage, state, createEmptyProgress(), 2_000), false);
});
