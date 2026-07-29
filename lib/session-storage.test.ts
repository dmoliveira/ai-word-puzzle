import assert from "node:assert/strict";
import test from "node:test";
import type { ProgressSnapshot } from "@/lib/game-types";
import { createEmptyProgress, recordRunProgress } from "@/lib/progress";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { createAttemptFromRun, finalizeAttempt, snapshotAttempt } from "@/lib/run-state";
import {
  createPortableBackup,
  decodePersistedGame,
  gameStorageKey,
  hasPortableImportUndo,
  importPortableBackup,
  legacySessionStorageKey,
  maxPortableBackupBytes,
  maxV3EnvelopeBytes,
  previewPortableBackup,
  readStoredGame,
  reconcilePagehideSnapshots,
  serializeStoredGame,
  shouldRestoreAttempt,
  stagePagehideSnapshot,
  storageV3CommitKey,
  storageV3ImportUndoKey,
  storageV3PagehidePrefix,
  storageV3PreviousKey,
  storageV3PrimaryKey,
  undoPortableImport,
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

function createQuestV4State(nowMs = 1_000, seed = "trace-myth", attemptId = "attempt-quest-v4") {
  const run = buildPuzzleRun({ mode: "custom", seed, topics: ["myth"], puzzleSize: 6, boardView: "quest" }, nowMs);
  return createAttemptFromRun(run, nowMs, attemptId);
}

test("Quest v4 writes attempt schema 4 and restores only a certified native board", () => {
  const state = createQuestV4State();
  const raw = serializeStoredGame(state, createEmptyProgress(), 2_000, "save-quest-v4");
  const envelope = JSON.parse(raw) as Record<string, any>;
  assert.equal(envelope.branches.attempt.stateSchemaVersion, 4);
  const storage = new MemoryStorage();
  commitRaw(storage, raw);
  const decoded = readStoredGame(storage, 2_000);
  assert.ok(decoded.currentAttempt, JSON.stringify({ source: decoded.source, issues: decoded.issues }));
  assert.equal(decoded.currentAttempt.run.generatorVersion, 4);
  assert.equal(decoded.currentAttempt.run.puzzleId.startsWith("q4-"), true);
  const backup = createPortableBackup(state, createEmptyProgress(), 2_000);
  assert.equal(backup.ok, true);
  if (backup.ok) assert.equal(previewPortableBackup(backup.raw, 2_000).ok, true);

  const corruptions = [
    (value: Record<string, any>) => { value.branches.attempt.value.run.board.grid[0] = `z${value.branches.attempt.value.run.board.grid[0].slice(1)}`; },
    (value: Record<string, any>) => { value.branches.attempt.value.run.board.paths[0].deltaRow = 0; value.branches.attempt.value.run.board.paths[0].deltaCol = 0; },
    (value: Record<string, any>) => { value.branches.attempt.value.run.board.fingerprint = `q4-${"0".repeat(64)}`; },
    (value: Record<string, any>) => { value.branches.attempt.value.run.puzzleFingerprint = `p1-${"0".repeat(64)}`; },
  ];
  for (const corrupt of corruptions) {
    const changed = structuredClone(envelope);
    corrupt(changed);
    const corruptStorage = new MemoryStorage();
    commitRaw(corruptStorage, JSON.stringify(changed));
    const corruptRead = readStoredGame(corruptStorage, 2_000);
    assert.equal(corruptRead.currentAttempt, null);
    assert.ok(corruptRead.issues.includes("attempt-unavailable"));
  }
});

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

function createBackupCandidate(state: ReturnType<typeof createState> | null, progress = createEmptyProgress(), nowMs = 2_000) {
  const backup = createPortableBackup(state, progress, nowMs);
  assert.equal(backup.ok, true);
  if (!backup.ok) throw new Error("Could not create backup fixture.");
  const preview = previewPortableBackup(backup.raw, nowMs + 1);
  assert.equal(preview.ok, true);
  if (!preview.ok) throw new Error("Could not preview backup fixture.");
  return { backup, candidate: preview.candidate };
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

test("a pre-provenance v3 attempt migrates in memory and its raw envelope is preserved as backup", async () => {
  const storage = new MemoryStorage();
  const envelope = JSON.parse(serializeStoredGame(createState(), createEmptyProgress(), 2_000, "save-storage-oldv3")) as Record<string, any>;
  const run = envelope.branches.attempt.value.run;
  delete run.corpusRevision;
  delete run.fingerprintVersion;
  delete run.puzzleFingerprint;
  envelope.branches.attempt.stateSchemaVersion = 2;
  const oldRaw = JSON.stringify(envelope);
  commitRaw(storage, oldRaw);

  const loaded = readStoredGame(storage, 3_000);

  assert.equal(loaded.source, "v3-primary");
  assert.equal(loaded.currentAttempt?.run.corpusRevision, null);
  assert.equal(loaded.currentAttempt?.run.puzzleFingerprint, null);
  assert.ok(loaded.currentAttempt);
  const result = await writeStoredGame(storage, loaded.currentAttempt, loaded.progress, 4_000, {
    expectedSaveId: "save-storage-oldv3",
    saveId: "save-storage-newv3",
  });
  assert.equal(result.ok, true);
  assert.equal(storage.values.get(storageV3PreviousKey), oldRaw);
  assert.equal((JSON.parse(storage.values.get(storageV3PrimaryKey)!) as Record<string, any>).branches.attempt.stateSchemaVersion, 3);
});

for (const [attemptSchema, progressSchema] of [[2, 2], [2, 3], [3, 2], [3, 3]] as const) {
  test(`storage v3 accepts attempt schema ${attemptSchema} with progress schema ${progressSchema}`, () => {
    const storage = new MemoryStorage();
    const envelope = JSON.parse(serializeStoredGame(createState(), createEmptyProgress(), 2_000, `save-matrix-${attemptSchema}${progressSchema}0000`)) as Record<string, any>;
    if (attemptSchema === 2) {
      delete envelope.branches.attempt.value.run.corpusRevision;
      delete envelope.branches.attempt.value.run.fingerprintVersion;
      delete envelope.branches.attempt.value.run.puzzleFingerprint;
      envelope.branches.attempt.stateSchemaVersion = 2;
    }
    if (progressSchema === 2) {
      delete envelope.branches.progress.value.dailyLedger;
      envelope.branches.progress.value.schemaVersion = 2;
      envelope.branches.progress.stateSchemaVersion = 2;
    }
    commitRaw(storage, JSON.stringify(envelope));

    const loaded = readStoredGame(storage, 3_000);

    assert.equal(loaded.source, "v3-primary");
    assert.equal(loaded.currentAttempt?.attemptId, "attempt-storage");
    assert.equal(loaded.progress.schemaVersion, 3);
  });
}

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
  const validProgress = createEmptyProgress();
  const { dailyLedger: _dailyLedger, ...legacyProgress } = validProgress;
  const validV2Progress = { ...legacyProgress, schemaVersion: 2 };
  const attemptOnly = new MemoryStorage();
  attemptOnly.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 2, currentAttempt: snapshotAttempt(state, 2_000), progress: { broken: true } }));
  attemptOnly.values.set(legacySessionStorageKey, createLegacyRaw());
  const attemptResult = readStoredGame(attemptOnly, 3_000);
  assert.equal(attemptResult.source, "v2-migrated");
  assert.equal(attemptResult.currentAttempt?.attemptId, state.attemptId);
  assert.deepEqual(attemptResult.progress, createEmptyProgress());
  assert.ok(attemptResult.issues.includes("progress-reset"));

  const progressOnly = new MemoryStorage();
  progressOnly.values.set(gameStorageKey, JSON.stringify({ schemaVersion: 2, currentAttempt: { broken: true }, progress: validV2Progress }));
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
  const { corpusRevision: _corpusRevision, fingerprintVersion: _fingerprintVersion, puzzleFingerprint: _puzzleFingerprint, ...previousRun } = state.run;
  const raw = JSON.stringify({
    schemaVersion: 2,
    currentAttempt: {
      ...state,
      run: {
        ...previousRun,
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
  { name: "provenance fingerprint mismatch", apply: (value: Record<string, any>) => { value.branches.attempt.value.run.puzzleFingerprint = `p1-${"0".repeat(64)}`; } },
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

test("portable backup is bounded, answer-bearing, and previews only safe metadata", () => {
  const state = createState(1_000, "portable", "attempt-portable");
  const progress = recordRunProgress(createEmptyProgress(), state, 2_000);
  const { backup, candidate } = createBackupCandidate(state, progress, 2_000);
  const wrapper = JSON.parse(backup.raw) as Record<string, any>;

  assert.ok(backup.bytes <= maxPortableBackupBytes);
  assert.deepEqual(Object.keys(wrapper).sort(), ["backupVersion", "containsAnswers", "envelope", "exportedAt", "format"]);
  assert.equal(wrapper.containsAnswers, true);
  assert.equal(candidate.preview.attemptStatus, "unfinished");
  assert.equal(candidate.preview.historyCount, 1);
  assert.equal(JSON.stringify(candidate.preview).includes(state.run.words[0].answer), false);

  const progressOnly = createBackupCandidate(null, createEmptyProgress(), 3_000);
  assert.equal(progressOnly.candidate.preview.attemptStatus, "none");
});

test("portable preview rejects malformed, oversized, future, and semantically invalid backups", () => {
  const { backup } = createBackupCandidate(createState(), createEmptyProgress(), 2_000);
  const futureBackup = JSON.parse(backup.raw) as Record<string, any>;
  futureBackup.backupVersion = 2;
  const futureGenerator = JSON.parse(backup.raw) as Record<string, any>;
  futureGenerator.envelope.branches.attempt.value.run.generatorVersion = 99;
  const invalidBoard = JSON.parse(backup.raw) as Record<string, any>;
  invalidBoard.envelope.branches.attempt.value.run.board.cells[0].solution = "z";
  const extraKey = JSON.parse(backup.raw) as Record<string, any>;
  extraKey.extra = true;

  assert.deepEqual(previewPortableBackup("not-json"), { ok: false, code: "invalid-backup" });
  assert.deepEqual(previewPortableBackup("x".repeat(maxPortableBackupBytes + 1)), { ok: false, code: "backup-too-large" });
  assert.deepEqual(previewPortableBackup(JSON.stringify(futureBackup)), { ok: false, code: "future-version" });
  assert.deepEqual(previewPortableBackup(JSON.stringify(futureGenerator)), { ok: false, code: "future-version" });
  assert.deepEqual(previewPortableBackup(JSON.stringify(invalidBoard)), { ok: false, code: "invalid-backup" });
  assert.deepEqual(previewPortableBackup(JSON.stringify(extraKey)), { ok: false, code: "invalid-backup" });
});

test("replace-only import commits both branches and durable undo restores the complete prior envelope", async () => {
  const storage = new MemoryStorage();
  const before = createState(1_000, "before-import", "attempt-before-import");
  const beforeProgress = recordRunProgress(createEmptyProgress(), before, 2_000);
  assert.equal((await writeStoredGame(storage, before, beforeProgress, 2_000, { expectedSaveId: null, saveId: "save-before-import" })).ok, true);
  const beforeRaw = storage.values.get(storageV3PrimaryKey)!;
  const untouchedV2 = createV2Raw(before, beforeProgress, 2_000);
  storage.values.set(gameStorageKey, untouchedV2);

  const imported = createState(3_000, "imported", "attempt-imported");
  const importedProgress = recordRunProgress(createEmptyProgress(), imported, 4_000);
  const { candidate } = createBackupCandidate(imported, importedProgress, 4_000);
  storage.operations.length = 0;
  const result = await importPortableBackup(storage, candidate, { expectedSaveId: "save-before-import" }, 5_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.currentAttempt?.attemptId, "attempt-imported");
  assert.deepEqual(result.progress.history.map((entry) => entry.attemptId), ["attempt-imported"]);
  assert.equal(result.undoAvailable, true);
  assert.equal(storage.values.get(storageV3PreviousKey), beforeRaw);
  assert.equal(storage.values.get(gameStorageKey), untouchedV2);
  assert.equal(storage.operations.filter((operation) => operation === `set:${storageV3PrimaryKey}`).length, 1);
  assert.equal(hasPortableImportUndo(storage, result.saveId, 5_001), true);

  const undone = await undoPortableImport(storage, { expectedSaveId: result.saveId }, 6_000);
  assert.equal(undone.ok, true);
  if (!undone.ok) return;
  assert.equal(undone.currentAttempt?.attemptId, "attempt-before-import");
  assert.deepEqual(undone.progress.history.map((entry) => entry.attemptId), ["attempt-before-import"]);
  assert.equal(undone.undoAvailable, false);
  assert.equal(storage.values.has(storageV3ImportUndoKey), false);
  assert.equal(readStoredGame(storage, 6_001).currentAttempt?.attemptId, "attempt-before-import");
});

test("pagehide reconciliation advances the import receipt so undo survives reload", async () => {
  const storage = new MemoryStorage();
  const before = createState(1_000, "before", "attempt-before");
  assert.equal((await writeStoredGame(storage, before, createEmptyProgress(), 2_000, { saveId: "save-before-0001" })).ok, true);
  const imported = createState(3_000, "imported", "attempt-imported");
  const { candidate } = createBackupCandidate(imported, createEmptyProgress(), 4_000);
  const importedResult = await importPortableBackup(storage, candidate, { expectedSaveId: "save-before-0001" }, 5_000);
  assert.equal(importedResult.ok, true);
  if (!importedResult.ok || !importedResult.currentAttempt) return;
  assert.equal(stagePagehideSnapshot(storage, importedResult.currentAttempt, importedResult.progress, 6_000, {
    baseSaveId: importedResult.saveId,
    writerId: "reload-writer",
  }).ok, true);

  const reconciled = await reconcilePagehideSnapshots(storage, 7_000);

  assert.equal(reconciled?.ok, true);
  if (!reconciled?.ok) return;
  assert.equal(hasPortableImportUndo(storage, reconciled.saveId, 7_001), true);
  const undone = await undoPortableImport(storage, { expectedSaveId: reconciled.saveId }, 8_000);
  assert.equal(undone.ok, true);
  if (undone.ok) assert.equal(undone.currentAttempt?.attemptId, "attempt-before");
});

test("import supports a progress-only backup and preserves supported old branch schemas", async () => {
  const storage = new MemoryStorage();
  const backup = createPortableBackup(null, createEmptyProgress(), 2_000);
  assert.equal(backup.ok, true);
  if (!backup.ok) return;
  const wrapper = JSON.parse(backup.raw) as Record<string, any>;
  wrapper.envelope.branches.progress.stateSchemaVersion = 2;
  wrapper.envelope.branches.progress.value.schemaVersion = 2;
  delete wrapper.envelope.branches.progress.value.dailyLedger;
  const preview = previewPortableBackup(JSON.stringify(wrapper), 2_001);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const result = await importPortableBackup(storage, preview.candidate, { expectedSaveId: null }, 3_000);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.currentAttempt, null);
  assert.equal(result.progress.schemaVersion, 3);
  const stored = JSON.parse(storage.values.get(storageV3PrimaryKey)!) as Record<string, any>;
  assert.equal(stored.branches.attempt, null);
  assert.equal(stored.branches.progress.stateSchemaVersion, 2);
});

test("stale or failed imports leave the canonical head unchanged and no active undo", async () => {
  const storage = new MemoryStorage();
  const before = createState(1_000, "before", "attempt-before");
  assert.equal((await writeStoredGame(storage, before, createEmptyProgress(), 2_000, { expectedSaveId: null, saveId: "save-before-0001" })).ok, true);
  const beforeRaw = storage.values.get(storageV3PrimaryKey)!;
  const { candidate } = createBackupCandidate(createState(3_000, "after", "attempt-after"), createEmptyProgress(), 4_000);

  const stale = await importPortableBackup(storage, candidate, { expectedSaveId: "save-stale-0000" }, 5_000);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "concurrent-write");
  assert.equal(storage.values.get(storageV3PrimaryKey), beforeRaw);
  assert.equal(storage.values.has(storageV3ImportUndoKey), false);

  storage.onSet = (key) => {
    if (key === storageV3PrimaryKey) throw new DOMException("full", "QuotaExceededError");
  };
  const failed = await importPortableBackup(storage, candidate, { expectedSaveId: "save-before-0001" }, 6_000);
  storage.onSet = null;
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.code, "quota-exceeded");
  assert.equal(storage.values.get(storageV3PrimaryKey), beforeRaw);
  assert.equal(storage.values.has(storageV3ImportUndoKey), false);
});

test("a later verified save expires import undo without risking the imported state", async () => {
  const storage = new MemoryStorage();
  const before = createState(1_000, "before", "attempt-before");
  assert.equal((await writeStoredGame(storage, before, createEmptyProgress(), 2_000, { saveId: "save-before-0001" })).ok, true);
  const imported = createState(3_000, "imported", "attempt-imported");
  const { candidate } = createBackupCandidate(imported, createEmptyProgress(), 4_000);
  const result = await importPortableBackup(storage, candidate, { expectedSaveId: "save-before-0001" }, 5_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((await writeStoredGame(storage, imported, createEmptyProgress(), 6_000, { expectedSaveId: result.saveId, saveId: "save-after-import" })).ok, true);

  assert.equal(hasPortableImportUndo(storage, "save-after-import", 7_000), false);
  const undo = await undoPortableImport(storage, { expectedSaveId: "save-after-import" }, 7_000);
  assert.equal(undo.ok, false);
  assert.equal(readStoredGame(storage, 7_001).currentAttempt?.attemptId, "attempt-imported");
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
