import assert from "node:assert/strict";
import test from "node:test";
import type { ProgressSnapshot } from "@/lib/game-types";
import { createEmptyProgress, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, finalizeAttempt, snapshotAttempt } from "@/lib/run-state";
import {
  decodePersistedGame,
  gameStorageKey,
  legacySessionStorageKey,
  maxV3EnvelopeBytes,
  readStoredGame,
  reconcilePagehideSnapshots,
  serializeStoredGame,
  shouldRestoreAttempt,
  stagePagehideSnapshot,
  storageV3CommitKey,
  storageV3PagehidePrefix,
  storageV3PreviousKey,
  storageV3PrimaryKey,
  writeStoredGame,
} from "@/lib/session-storage";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  writes = 0;
  reads = 0;
  onGet: ((key: string, value: string | null, count: number) => string | null) | null = null;
  onSet: ((key: string, value: string, count: number) => void) | null = null;

  get length() {
    return this.values.size;
  }

  getItem(key: string) {
    this.reads += 1;
    this.operations.push(`get:${key}`);
    const value = this.values.get(key) ?? null;
    return this.onGet ? this.onGet(key, value, this.reads) : value;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    this.operations.push(`set:${key}`);
    this.onSet?.(key, value, this.writes);
    this.values.set(key, value);
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.operations.push(`remove:${key}`);
    this.values.delete(key);
  }

  clear() {
    this.operations.push("clear");
    this.values.clear();
  }
}

function createState(nowMs = 1_000, seed = "storage-tests", attemptId = "attempt-storage") {
  const run = buildPuzzleRun({ mode: "custom", seed, puzzleSize: 4, timerEnabled: true });
  return createAttemptFromRun(run, nowMs, attemptId);
}

function createV2Raw(state = createState(), progress = createEmptyProgress(), nowMs = 2_000) {
  return JSON.stringify({ schemaVersion: 2, currentAttempt: snapshotAttempt(state, nowMs), progress });
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

function commitRaw(storage: MemoryStorage, raw: string) {
  const saveId = (JSON.parse(raw) as { saveId: string }).saveId;
  storage.values.set(storageV3PrimaryKey, raw);
  storage.values.set(storageV3CommitKey, JSON.stringify({
    format: "astra-lexa/local-save-commit",
    markerVersion: 1,
    storageVersion: 3,
    committedSaveId: saveId,
    pendingSaveId: null,
  }));
}

function mutateEnvelope(raw: string, mutate: (value: Record<string, any>) => void) {
  const value = JSON.parse(raw) as Record<string, any>;
  mutate(value);
  return JSON.stringify(value);
}

test("v3 writes a verified journal and restores a settled canonical attempt", async () => {
  const storage = new MemoryStorage();
  const state = createState(1_000);
  const progress = createEmptyProgress();
  const result = await writeStoredGame(storage, state, progress, 4_000, { expectedSaveId: null, saveId: "save-storage-0001" });

  assert.deepEqual(result, { ok: true, saveId: "save-storage-0001", bytes: (result as { bytes: number }).bytes });
  assert.equal(storage.values.has(storageV3PreviousKey), false);
  assert.equal(storage.values.has(gameStorageKey), false);
  assert.equal(storage.operations.filter((operation) => operation === `set:${storageV3PrimaryKey}`).length, 1);
  assert.deepEqual(storage.operations.filter((operation) => operation.startsWith("set:")), [
    `set:${storageV3CommitKey}`,
    `set:${storageV3PrimaryKey}`,
    `set:${storageV3CommitKey}`,
  ]);

  const loaded = readStoredGame(storage, 20_000);
  assert.equal(loaded.source, "v3-primary");
  assert.equal(loaded.committedSaveId, "save-storage-0001");
  assert.equal(loaded.currentAttempt?.attemptId, state.attemptId);
  assert.equal(loaded.currentAttempt?.elapsedMs, 3_000);
  assert.equal(loaded.currentAttempt?.lastTickAt, null);
  assert.deepEqual(loaded.issues, []);
});

test("a second save backs up the committed raw envelope before one candidate write", async () => {
  const storage = new MemoryStorage();
  const firstState = createState(1_000, "first", "attempt-first");
  const secondState = createState(2_000, "second", "attempt-second");
  assert.equal((await writeStoredGame(storage, firstState, createEmptyProgress(), 3_000, { expectedSaveId: null, saveId: "save-storage-0001" })).ok, true);
  const firstRaw = storage.values.get(storageV3PrimaryKey)!;
  storage.operations.length = 0;

  const result = await writeStoredGame(storage, secondState, createEmptyProgress(), 4_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" });

  assert.equal(result.ok, true);
  assert.equal(storage.values.get(storageV3PreviousKey), firstRaw);
  assert.equal(storage.operations.filter((operation) => operation === `set:${storageV3PrimaryKey}`).length, 1);
  assert.deepEqual(storage.operations.filter((operation) => operation.startsWith("set:")), [
    `set:${storageV3PreviousKey}`,
    `set:${storageV3CommitKey}`,
    `set:${storageV3PrimaryKey}`,
    `set:${storageV3CommitKey}`,
  ]);
  assert.equal(readStoredGame(storage, 5_000).currentAttempt?.attemptId, "attempt-second");
});

test("v2 migration is pure and leaves every source byte untouched", () => {
  const storage = new MemoryStorage();
  const raw = createV2Raw();
  const legacyRaw = createLegacyRaw();
  storage.values.set(gameStorageKey, raw);
  storage.values.set(legacySessionStorageKey, legacyRaw);

  const loaded = readStoredGame(storage, 5_000);

  assert.equal(loaded.source, "v2-migrated");
  assert.equal(loaded.currentAttempt?.attemptId, "attempt-storage");
  assert.equal(storage.values.get(gameStorageKey), raw);
  assert.equal(storage.values.get(legacySessionStorageKey), legacyRaw);
  assert.equal(storage.writes, 0);
});

test("invalid v2 data falls back to legacy without mutating either key", () => {
  const storage = new MemoryStorage();
  const v2Raw = JSON.stringify({ schemaVersion: 99 });
  const legacyRaw = createLegacyRaw();
  storage.values.set(gameStorageKey, v2Raw);
  storage.values.set(legacySessionStorageKey, legacyRaw);

  const loaded = readStoredGame(storage, 5_000);

  assert.equal(loaded.source, "legacy-migrated");
  assert.equal(loaded.currentAttempt?.assists.hintStepsByWord[loaded.currentAttempt.run.words[0].id], 2);
  assert.equal(storage.values.get(gameStorageKey), v2Raw);
  assert.equal(storage.values.get(legacySessionStorageKey), legacyRaw);
  assert.equal(storage.writes, 0);
});

test("v2 attempt and progress migrate independently before legacy fallback", () => {
  const state = createState();
  const validProgress = recordRunProgress(createEmptyProgress(), state, 2_000);
  const attemptOnly = new MemoryStorage();
  attemptOnly.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 2, currentAttempt: snapshotAttempt(state, 2_000), progress: { broken: true } }));
  attemptOnly.values.set(legacySessionStorageKey, createLegacyRaw());
  const attemptResult = readStoredGame(attemptOnly, 3_000);
  assert.equal(attemptResult.source, "v2-migrated");
  assert.equal(attemptResult.currentAttempt?.attemptId, state.attemptId);
  assert.deepEqual(attemptResult.progress, createEmptyProgress());
  assert.ok(attemptResult.issues.includes("progress-reset"));

  const progressOnly = new MemoryStorage();
  progressOnly.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 2, currentAttempt: { broken: true }, progress: validProgress }));
  progressOnly.values.set(legacySessionStorageKey, createLegacyRaw());
  const progressResult = readStoredGame(progressOnly, 3_000);
  assert.equal(progressResult.source, "v2-migrated");
  assert.equal(progressResult.currentAttempt, null);
  assert.deepEqual(progressResult.progress, validProgress);
  assert.ok(progressResult.issues.includes("attempt-unavailable"));
});

test("previous generator-v2 envelopes migrate without rewriting their source", async () => {
  const storage = new MemoryStorage();
  const state = createState();
  const previousWords = state.run.words.map(({ source: _source, qualityStatus: _qualityStatus, clue: _clue, ...word }) => word);
  const { timerEnabled: _timerEnabled, learningMode: _learningMode, ...previousOptions } = state.run.options;
  const raw = JSON.stringify({
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
  });
  storage.values.set(gameStorageKey, raw);

  const loaded = readStoredGame(storage, 5_000);

  assert.equal(loaded.source, "v2-migrated");
  assert.equal(loaded.currentAttempt?.run.generatorVersion, 2);
  assert.equal(loaded.currentAttempt?.run.options.timerEnabled, true);
  assert.ok(loaded.currentAttempt?.run.words.every((word) => word.source && word.learningNote && "clue" in word));
  assert.ok(loaded.currentAttempt);
  assert.equal((await writeStoredGame(storage, loaded.currentAttempt, loaded.progress, 6_000, { expectedSaveId: null, saveId: "save-storage-legacy2" })).ok, true);
  assert.equal(storage.values.get(gameStorageKey), raw);
  assert.ok(storage.writes > 0);
});

test("an adopted corrupt primary recovers previous and never resurrects stale v2", async () => {
  const storage = new MemoryStorage();
  const staleV2 = createV2Raw(createState(1_000, "stale", "attempt-stale"));
  storage.values.set(gameStorageKey, staleV2);
  assert.equal((await writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
  assert.equal((await writeStoredGame(storage, createState(2_000, "second", "attempt-second"), createEmptyProgress(), 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" })).ok, true);
  storage.values.set(storageV3PrimaryKey, "not-json");

  const loaded = readStoredGame(storage, 4_000);

  assert.equal(loaded.source, "v3-previous");
  assert.equal(loaded.currentAttempt?.attemptId, "attempt-first");
  assert.ok(loaded.issues.includes("malformed-primary"));
  assert.ok(loaded.issues.includes("recovered-previous"));
  assert.equal(storage.values.get(gameStorageKey), staleV2);
});

test("adopted corrupt copies enter recovery instead of consulting v2", () => {
  const storage = new MemoryStorage();
  storage.values.set(gameStorageKey, createV2Raw(createState(1_000, "stale", "attempt-stale")));
  storage.values.set(storageV3PrimaryKey, "broken");
  storage.values.set(storageV3PreviousKey, "also-broken");
  storage.values.set(storageV3CommitKey, JSON.stringify({
    format: "astra-lexa/local-save-commit", markerVersion: 1, storageVersion: 3, committedSaveId: "save-missing-0001", pendingSaveId: null,
  }));

  const loaded = readStoredGame(storage);

  assert.equal(loaded.source, "recovery");
  assert.equal(loaded.currentAttempt, null);
  assert.equal(loaded.writable, false);
  assert.ok(loaded.issues.includes("recovery-required"));
  assert.equal(storage.operations.includes(`get:${gameStorageKey}`), false);
});

test("a future primary recovers previous read-only and preserves all raw bytes", async () => {
  const storage = new MemoryStorage();
  assert.equal((await writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
  assert.equal((await writeStoredGame(storage, createState(2_000, "second", "attempt-second"), createEmptyProgress(), 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" })).ok, true);
  const futureRaw = JSON.stringify({ storageVersion: 99 });
  storage.values.set(storageV3PrimaryKey, futureRaw);

  const loaded = readStoredGame(storage, 4_000);

  assert.equal(loaded.source, "v3-previous");
  assert.equal(loaded.currentAttempt?.attemptId, "attempt-first");
  assert.equal(loaded.writable, false);
  assert.ok(loaded.issues.includes("future-version"));
  assert.equal(storage.values.get(storageV3PrimaryKey), futureRaw);
});

test("attempt and progress branches recover independently", async () => {
  const storage = new MemoryStorage();
  const first = createState(1_000, "first", "attempt-first");
  const second = createState(2_000, "second", "attempt-second");
  const firstProgress = recordRunProgress(createEmptyProgress(), first, 2_000);
  const secondProgress = recordRunProgress(firstProgress, second, 3_000);
  assert.equal((await writeStoredGame(storage, first, firstProgress, 2_000, { saveId: "save-storage-0001" })).ok, true);
  assert.equal((await writeStoredGame(storage, second, secondProgress, 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" })).ok, true);
  storage.values.set(storageV3PrimaryKey, mutateEnvelope(storage.values.get(storageV3PrimaryKey)!, (value) => {
    value.branches.progress.value.history = [{}];
  }));

  const progressRecovered = readStoredGame(storage, 4_000);
  assert.equal(progressRecovered.source, "v3-mixed");
  assert.equal(progressRecovered.currentAttempt?.attemptId, "attempt-second");
  assert.deepEqual(progressRecovered.progress.history.map((entry) => entry.attemptId), ["attempt-first"]);

  const primaryFromSecond = serializeStoredGame(second, secondProgress, 3_000, "save-storage-0002");
  storage.values.set(storageV3PrimaryKey, mutateEnvelope(primaryFromSecond, (value) => {
    value.branches.attempt.value.run.board.cells[0].solution = "z";
  }));
  const attemptRecovered = readStoredGame(storage, 4_000);
  assert.equal(attemptRecovered.source, "v3-mixed");
  assert.equal(attemptRecovered.currentAttempt?.attemptId, "attempt-first");
  assert.deepEqual(attemptRecovered.progress.history.map((entry) => entry.attemptId), ["attempt-second", "attempt-first"]);
});

test("a valid attempt tombstone does not resurrect the previous attempt", () => {
  const storage = new MemoryStorage();
  const firstRaw = serializeStoredGame(createState(), createEmptyProgress(), 2_000, "save-storage-0001");
  storage.values.set(storageV3PreviousKey, firstRaw);
  const tombstone = mutateEnvelope(firstRaw, (value) => {
    value.saveId = "save-storage-0002";
    value.savedAt = new Date(3_000).toISOString();
    value.branches.attempt = null;
  });
  commitRaw(storage, tombstone);

  const loaded = readStoredGame(storage, 4_000);

  assert.equal(loaded.source, "v3-primary");
  assert.equal(loaded.currentAttempt, null);
  assert.deepEqual(loaded.progress, createEmptyProgress());
});

test("pending first adoption with a missing primary is explicit recovery", () => {
  const storage = new MemoryStorage();
  storage.values.set(storageV3CommitKey, JSON.stringify({
    format: "astra-lexa/local-save-commit",
    markerVersion: 1,
    storageVersion: 3,
    committedSaveId: null,
    pendingSaveId: "save-missing-0001",
  }));

  const loaded = readStoredGame(storage);

  assert.equal(loaded.source, "recovery");
  assert.equal(loaded.currentAttempt, null);
  assert.equal(loaded.writable, false);
  assert.ok(loaded.issues.includes("recovery-required"));
});

test("a verified pending first adoption wins over stale v2 without reading it", () => {
  const storage = new MemoryStorage();
  const staleV2 = createV2Raw(createState(1_000, "stale", "attempt-stale"));
  const pending = serializeStoredGame(createState(2_000, "pending", "attempt-pending"), createEmptyProgress(), 3_000, "save-pending-0001");
  storage.values.set(gameStorageKey, staleV2);
  storage.values.set(storageV3PrimaryKey, pending);
  storage.values.set(storageV3CommitKey, JSON.stringify({
    format: "astra-lexa/local-save-commit",
    markerVersion: 1,
    storageVersion: 3,
    committedSaveId: null,
    pendingSaveId: "save-pending-0001",
  }));

  const loaded = readStoredGame(storage, 4_000);

  assert.equal(loaded.source, "v3-primary");
  assert.equal(loaded.currentAttempt?.attemptId, "attempt-pending");
  assert.equal(loaded.writable, false);
  assert.ok(loaded.issues.includes("recovered-pending"));
  assert.equal(storage.operations.includes(`get:${gameStorageKey}`), false);
  assert.equal(storage.values.get(gameStorageKey), staleV2);
});

test("the writer cannot overwrite a recovered pending first adoption", async () => {
  const storage = new MemoryStorage();
  const pendingRaw = serializeStoredGame(createState(1_000, "pending", "attempt-pending"), createEmptyProgress(), 2_000, "save-pending-0001");
  const markerRaw = JSON.stringify({
    format: "astra-lexa/local-save-commit",
    markerVersion: 1,
    storageVersion: 3,
    committedSaveId: null,
    pendingSaveId: "save-pending-0001",
  });
  storage.values.set(storageV3PrimaryKey, pendingRaw);
  storage.values.set(storageV3CommitKey, markerRaw);

  const result = await writeStoredGame(storage, createState(3_000, "replacement", "attempt-replacement"), createEmptyProgress(), 4_000, {
    expectedSaveId: null,
    saveId: "save-replacement-0001",
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "recovery-required");
  assert.equal(storage.values.get(storageV3PrimaryKey), pendingRaw);
  assert.equal(storage.values.get(storageV3CommitKey), markerRaw);
  assert.equal(storage.writes, 0);
});

for (const mutation of [
  { name: "duplicate cell", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.cells.push(value.branches.attempt.value.run.board.cells[0]); } },
  { name: "missing cell", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.cells.pop(); } },
  { name: "extra cell", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.cells.push({ row: 0, col: 0, solution: "x", clueNumbers: [], wordIds: [] }); } },
  { name: "out-of-bounds endpoint", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.placements[0].col = 999; } },
  { name: "solution mismatch", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.cells[0].solution = "z"; } },
  { name: "clue mismatch", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.board.placements[0].clueNumber = 99; } },
  { name: "puzzle identity mismatch", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.puzzleId = "tampered"; } },
]) {
  test(`strict v3 rejects semantic board mutation: ${mutation.name}`, () => {
    const storage = new MemoryStorage();
    const raw = mutateEnvelope(serializeStoredGame(createState(), createEmptyProgress(), 2_000, "save-storage-0001"), mutation.apply);
    commitRaw(storage, raw);

    const loaded = readStoredGame(storage, 3_000);

    assert.equal(loaded.currentAttempt, null);
    assert.deepEqual(loaded.progress, createEmptyProgress());
    assert.ok(loaded.issues.includes("attempt-unavailable"));
  });
}

test("strict v3 rejects inconsistent attempt and progress semantics independently", () => {
  const state = createState();
  const progress = recordRunProgress(createEmptyProgress(), state, 2_000);
  const attemptStorage = new MemoryStorage();
  commitRaw(attemptStorage, mutateEnvelope(serializeStoredGame(state, progress, 2_000, "save-storage-0001"), (value) => {
    value.branches.attempt.value.solvedIds = [state.run.words[0].id];
  }));
  const attemptResult = readStoredGame(attemptStorage, 3_000);
  assert.equal(attemptResult.currentAttempt, null);
  assert.equal(attemptResult.progress.history.length, 1);

  const progressStorage = new MemoryStorage();
  commitRaw(progressStorage, mutateEnvelope(serializeStoredGame(state, progress, 2_000, "save-storage-0001"), (value) => {
    value.branches.progress.value.history[0].assists.total = 99;
  }));
  const progressResult = readStoredGame(progressStorage, 3_000);
  assert.equal(progressResult.currentAttempt?.attemptId, state.attemptId);
  assert.deepEqual(progressResult.progress, createEmptyProgress());
});

test("writer rejects invalid and oversized candidates before any mutation", async () => {
  const state = createState();
  const invalidStorage = new MemoryStorage();
  const duplicateProgress = recordRunProgress(createEmptyProgress(), state, 2_000);
  duplicateProgress.history.push({ ...duplicateProgress.history[0] });
  const invalid = await writeStoredGame(invalidStorage, state, duplicateProgress, 2_000, { saveId: "save-storage-0001" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, "candidate-invalid");
  assert.equal(invalidStorage.writes, 0);

  const largeStorage = new MemoryStorage();
  const largeProgress = recordRunProgress(createEmptyProgress(), state, 2_000) as ProgressSnapshot;
  largeProgress.history[0].title = "é".repeat(maxV3EnvelopeBytes);
  const large = await writeStoredGame(largeStorage, state, largeProgress, 2_000, { saveId: "save-storage-0001" });
  assert.equal(large.ok, false);
  if (!large.ok) assert.equal(large.code, "candidate-too-large");
  assert.equal(largeStorage.writes, 0);
});

test("concurrent revision mismatch performs no writes", async () => {
  const storage = new MemoryStorage();
  assert.equal((await writeStoredGame(storage, createState(), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
  const writes = storage.writes;
  const result = await writeStoredGame(storage, createState(), createEmptyProgress(), 3_000, { expectedSaveId: "save-stale-0000", saveId: "save-storage-0002" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "concurrent-write");
  assert.equal(storage.writes, writes);
});

test("the coordinator serializes competing writes so exactly one stale revision wins", async () => {
  const storage = new MemoryStorage();
  const [first, second] = await Promise.all([
    writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { expectedSaveId: null, saveId: "save-race-0001" }),
    writeStoredGame(storage, createState(1_000, "second", "attempt-second"), createEmptyProgress(), 2_000, { expectedSaveId: null, saveId: "save-race-0002" }),
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  const rejected = [first, second].find((result) => !result.ok);
  assert.ok(rejected && !rejected.ok);
  if (rejected && !rejected.ok) assert.equal(rejected.code, "concurrent-write");
  const loaded = readStoredGame(storage, 3_000);
  assert.ok(["attempt-first", "attempt-second"].includes(loaded.currentAttempt?.attemptId ?? ""));
});

test("pagehide staging leaves the canonical head untouched until coordinated reconciliation", async () => {
  const storage = new MemoryStorage();
  const first = createState(1_000, "first", "attempt-first");
  const second = createState(2_000, "second", "attempt-second");
  assert.equal((await writeStoredGame(storage, first, createEmptyProgress(), 2_000, { expectedSaveId: null, saveId: "save-storage-0001" })).ok, true);
  const canonicalRaw = storage.values.get(storageV3PrimaryKey);

  const staged = stagePagehideSnapshot(storage, second, createEmptyProgress(), 3_000, {
    baseSaveId: "save-storage-0001",
    writerId: "writer-a",
  });

  assert.equal(staged.ok, true);
  assert.equal(storage.values.get(storageV3PrimaryKey), canonicalRaw);
  const reconciled = await reconcilePagehideSnapshots(storage, 4_000);
  assert.equal(reconciled?.ok, true);
  assert.equal(readStoredGame(storage, 4_000).currentAttempt?.attemptId, "attempt-second");
  assert.equal(storage.values.has(`${storageV3PagehidePrefix}writer-a`), false);
});

test("stale and malformed pagehide records are discarded without replacing a newer head", async () => {
  const storage = new MemoryStorage();
  const first = createState(1_000, "first", "attempt-first");
  const deferred = createState(2_000, "deferred", "attempt-deferred");
  const newest = createState(3_000, "newest", "attempt-newest");
  assert.equal((await writeStoredGame(storage, first, createEmptyProgress(), 2_000, { expectedSaveId: null, saveId: "save-storage-0001" })).ok, true);
  assert.equal(stagePagehideSnapshot(storage, deferred, createEmptyProgress(), 3_000, {
    baseSaveId: "save-storage-0001",
    writerId: "writer-stale",
  }).ok, true);
  storage.values.set(`${storageV3PagehidePrefix}malformed`, "not-json");
  assert.equal((await writeStoredGame(storage, newest, createEmptyProgress(), 4_000, {
    expectedSaveId: "save-storage-0001",
    saveId: "save-storage-0002",
  })).ok, true);

  const reconciled = await reconcilePagehideSnapshots(storage, 5_000);

  assert.equal(reconciled, null);
  assert.equal(readStoredGame(storage, 5_000).currentAttempt?.attemptId, "attempt-newest");
  assert.equal([...storage.values.keys()].some((key) => key.startsWith(storageV3PagehidePrefix)), false);
});

test("pagehide reconciliation reports denied enumeration instead of rejecting bootstrap", async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(storage, "length", { get: () => { throw new DOMException("denied", "SecurityError"); } });

  const result = await reconcilePagehideSnapshots(storage, 2_000);

  assert.equal(result?.ok, false);
  if (result && !result.ok) assert.equal(result.code, "read-denied");
});

test("quota during primary write leaves the old committed save recoverable", async () => {
  const storage = new MemoryStorage();
  assert.equal((await writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
  storage.onSet = (key) => {
    if (key === storageV3PrimaryKey) throw new DOMException("full", "QuotaExceededError");
  };

  const result = await writeStoredGame(storage, createState(2_000, "second", "attempt-second"), createEmptyProgress(), 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "quota-exceeded");
    assert.equal(result.stage, "primary");
  }
  storage.onSet = null;
  const recovered = readStoredGame(storage, 4_000);
  assert.equal(recovered.currentAttempt?.attemptId, "attempt-first");
  assert.equal(recovered.committedSaveId, "save-storage-0001");
});

for (const fault of [
  { name: "backup", key: storageV3PreviousKey, commitWrite: null, expectedStage: "backup" as const },
  { name: "prepare", key: storageV3CommitKey, commitWrite: 1, expectedStage: "prepare" as const },
]) {
  test(`${fault.name} write failure leaves the existing primary committed`, async () => {
    const storage = new MemoryStorage();
    assert.equal((await writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
    let commitWrites = 0;
    storage.onSet = (key) => {
      if (key === storageV3CommitKey) commitWrites += 1;
      if (key === fault.key && (fault.commitWrite === null || commitWrites === fault.commitWrite)) {
        throw new DOMException("denied", "SecurityError");
      }
    };

    const result = await writeStoredGame(storage, createState(2_000, "second", "attempt-second"), createEmptyProgress(), 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.stage, fault.expectedStage);
    storage.onSet = null;
    const recovered = readStoredGame(storage, 4_000);
    assert.equal(recovered.currentAttempt?.attemptId, "attempt-first");
    assert.equal(recovered.committedSaveId, "save-storage-0001");
  });
}

test("commit failure keeps the old marker and previous envelope authoritative", async () => {
  const storage = new MemoryStorage();
  assert.equal((await writeStoredGame(storage, createState(1_000, "first", "attempt-first"), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" })).ok, true);
  let commitWrites = 0;
  storage.onSet = (key) => {
    if (key === storageV3CommitKey) {
      commitWrites += 1;
      if (commitWrites === 2) throw new DOMException("denied", "SecurityError");
    }
  };

  const result = await writeStoredGame(storage, createState(2_000, "second", "attempt-second"), createEmptyProgress(), 3_000, { expectedSaveId: "save-storage-0001", saveId: "save-storage-0002" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.stage, "commit");
  storage.onSet = null;
  const recovered = readStoredGame(storage, 4_000);
  assert.equal(recovered.currentAttempt?.attemptId, "attempt-first");
  assert.equal(recovered.committedSaveId, "save-storage-0001");
});

test("readback corruption aborts before commit", async () => {
  const storage = new MemoryStorage();
  storage.onGet = (key, value) => key === storageV3PrimaryKey && value ? `${value} ` : value;
  const result = await writeStoredGame(storage, createState(), createEmptyProgress(), 2_000, { saveId: "save-storage-0001" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "verification-failed");
    assert.equal(result.stage, "primary");
  }
});

test("malformed persisted v2 candidates remain rejected", () => {
  assert.equal(decodePersistedGame("{}"), null);
  assert.equal(decodePersistedGame("not-json"), null);
  assert.equal(decodePersistedGame(JSON.stringify({ schemaVersion: 2, currentAttempt: {}, progress: {} })), null);
});

test("boot restoration keeps unfinished attempts and only the matching completed daily", () => {
  const state = createState();
  assert.equal(shouldRestoreAttempt(state, "another-puzzle"), true);
  const completed = finalizeAttempt({ ...state, solvedIds: state.run.words.map((word) => word.id) }, 5_000);
  assert.equal(shouldRestoreAttempt(completed, state.run.puzzleId), true);
  assert.equal(shouldRestoreAttempt(completed, "today-different-puzzle"), false);
});
