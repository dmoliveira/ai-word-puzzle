import type {
  AssistLedger,
  PersistedGame,
  PersistedRunState,
  ProgressSnapshot,
  PuzzleBoard,
  PuzzleOptions,
  PuzzleRun,
  PuzzleWord,
} from "@/lib/game-types";
import { decodeProgressSnapshot, legacyProgressStorageKey } from "@/lib/progress";
import { isCanonicalDailyOptions, normalizePuzzleOptions } from "@/lib/puzzle-options";
import { hasVerifiedPuzzleProvenance } from "@/lib/puzzle-provenance";
import {
  finalizeAttempt,
  resumeStoredAttempt,
  runStateSchemaVersion,
  snapshotAttempt,
} from "@/lib/run-state";
import { wordBank } from "@/lib/word-bank";

export const gameStorageKey = "astra-lexa:v2";
export const legacySessionStorageKey = "astra-lexa-session";
export const storageV3PrimaryKey = "astra-lexa:v3";
export const storageV3PreviousKey = "astra-lexa:v3:previous";
export const storageV3CommitKey = "astra-lexa:v3:commit";
export const storageV3PagehidePrefix = "astra-lexa:v3:pagehide:";
export const storageV3ImportUndoKey = "astra-lexa:v3:import-undo";
export const maxV3EnvelopeBytes = 512 * 1024;
export const maxV3AttemptBranchBytes = 384 * 1024;
export const maxV3ProgressBranchBytes = 128 * 1024;
export const maxPortableBackupBytes = maxV3EnvelopeBytes + 4 * 1024;

export type StorageReadIssue =
  | "read-denied"
  | "future-version"
  | "malformed-primary"
  | "malformed-previous"
  | "recovered-previous"
  | "recovered-mixed"
  | "attempt-unavailable"
  | "progress-reset"
  | "interrupted-adoption"
  | "recovered-pending"
  | "recovery-required";

export type StoredGameResult = {
  currentAttempt: PersistedRunState | null;
  progress: ProgressSnapshot;
  source: "v3-primary" | "v3-previous" | "v3-mixed" | "v2-migrated" | "legacy-migrated" | "none" | "recovery";
  committedSaveId: string | null;
  adopted: boolean;
  writable: boolean;
  issues: StorageReadIssue[];
};

export type StorageFailureCode =
  | "storage-unavailable"
  | "read-denied"
  | "candidate-invalid"
  | "candidate-too-large"
  | "recovery-required"
  | "future-version"
  | "concurrent-write"
  | "lock-timeout"
  | "coordination-unavailable"
  | "quota-exceeded"
  | "write-denied"
  | "readback-mismatch"
  | "verification-failed"
  | "commit-uncertain";

export type StorageWriteResult =
  | { ok: true; saveId: string; bytes: number }
  | {
    ok: false;
    code: StorageFailureCode;
    stage: "preflight" | "backup" | "prepare" | "primary" | "commit";
    preservation: "unchanged" | "previous-valid" | "commit-uncertain";
    retryable: boolean;
  };

export type PagehideStageResult =
  | { ok: true; key: string }
  | { ok: false; code: "candidate-invalid" | "candidate-too-large" | "quota-exceeded" | "write-denied" | "readback-mismatch" };

export type PortableBackupPreview = {
  exportedAt: string;
  bytes: number;
  attemptStatus: "none" | "unfinished" | "completed";
  historyCount: number;
  creditedDays: number;
  lateClearDays: number;
};

export type PortableBackupCandidate = {
  preview: PortableBackupPreview;
  envelopeRaw: string;
};

export type PortableBackupCodecResult =
  | { ok: true; raw: string; bytes: number; filename: string }
  | { ok: false; code: "candidate-invalid" | "candidate-too-large" };

export type PortableBackupPreviewResult =
  | { ok: true; candidate: PortableBackupCandidate }
  | { ok: false; code: "invalid-backup" | "backup-too-large" | "future-version" };

export type PortableStorageResult =
  | {
    ok: true;
    saveId: string;
    bytes: number;
    currentAttempt: PersistedRunState | null;
    progress: ProgressSnapshot;
    undoAvailable: boolean;
  }
  | Exclude<StorageWriteResult, { ok: true }>;

type StorageEnvelopeV3 = {
  format: "astra-lexa/local-save";
  storageVersion: 3;
  saveId: string;
  savedAt: string;
  branches: {
    attempt: null | {
      branchVersion: 1;
      stateSchemaVersion: 3;
      value: PersistedRunState;
    };
    progress: {
      branchVersion: 1;
      stateSchemaVersion: 3;
      value: ProgressSnapshot;
    };
  };
};

type StorageCommitMarker = {
  format: "astra-lexa/local-save-commit";
  markerVersion: 1;
  storageVersion: 3;
  committedSaveId: string | null;
  pendingSaveId: string | null;
};

type PagehideSnapshot = {
  format: "astra-lexa/pagehide-save";
  snapshotVersion: 1;
  baseSaveId: string | null;
  capturedAt: string;
  candidateRaw: string;
};

type PortableImportUndo = {
  format: "astra-lexa/import-undo";
  undoVersion: 1;
  importedSaveId: string;
  capturedAt: string;
  previousEnvelopeRaw: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameData(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function decodeStringRecord(value: unknown) {
  if (!isObject(value) || !Object.values(value).every((entry) => typeof entry === "string")) {
    return null;
  }
  return value as Record<string, string>;
}

function decodeNumberRecord(value: unknown) {
  if (!isObject(value) || !Object.values(value).every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 3)) {
    return null;
  }
  return value as Record<string, number>;
}

function decodeOptions(value: unknown, nowMs: number, allowLegacyDefaults: boolean): PuzzleOptions | null {
  if (!isObject(value)) {
    return null;
  }

  const rawOptions = value as Partial<PuzzleOptions>;
  const normalized = allowLegacyDefaults
    ? {
        ...normalizePuzzleOptions({ ...rawOptions, boardView: "quest" }, nowMs),
        boardView: rawOptions.boardView === "quest" ? "quest" as const : "crossword" as const,
      }
    : normalizePuzzleOptions(rawOptions, nowMs);
  if (allowLegacyDefaults) {
    return normalized;
  }

  const exact = value.mode === normalized.mode
    && value.challenge === normalized.challenge
    && value.puzzleFamily === normalized.puzzleFamily
    && Array.isArray(value.topics)
    && value.topics.length === normalized.topics.length
    && value.topics.every((topic, index) => topic === normalized.topics[index])
    && value.contentPackId === normalized.contentPackId
    && value.puzzleSize === normalized.puzzleSize
    && value.boardView === normalized.boardView
    && value.style === normalized.style
    && value.timerEnabled === normalized.timerEnabled
    && value.learningMode === normalized.learningMode
    && value.seed === normalized.seed;

  return exact ? normalized : null;
}

function hasLegacyPuzzleWordShape(value: unknown) {
  if (!isObject(value)) {
    return false;
  }

  const requiredStrings = [
    "id", "answer", "normalized", "topicId", "topicLabel", "difficulty", "frequencyBand", "prompt", "microHint",
    "teaser", "learningNote", "plainMeaning", "pronunciationHint", "usageExample", "translationAid", "greekMark",
  ];

  return requiredStrings.every((key) => typeof value[key] === "string")
    && typeof value.length === "number"
    && Number.isInteger(value.length)
    && value.length > 0
    && value.length === (value.answer as string).length
    && typeof value.weight === "number"
    && isStringArray(value.contentPackIds)
    && isStringArray(value.relatedWords)
    && isStringArray(value.visuals);
}

function hydratePuzzleWord(value: unknown, allowDefaults: boolean): PuzzleWord | null {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.answer !== "string") {
    return null;
  }

  const normalized = typeof value.normalized === "string"
    ? value.normalized
    : value.answer.toLowerCase().replace(/[^a-z]/g, "");
  const current = wordBank.find((word) => word.id === value.id)
    ?? wordBank.find((word) => word.topicId === value.topicId && word.normalized === normalized)
    ?? wordBank.find((word) => word.normalized === normalized);
  const merged: Record<string, unknown> = current ? { ...current, ...value, normalized } : { ...value, normalized };
  if (!hasLegacyPuzzleWordShape(merged)) {
    return null;
  }

  const validSources = new Set<PuzzleWord["source"]>(["topic", "general", "synthetic", "lexicon"]);
  const source = validSources.has(merged.source as PuzzleWord["source"])
    ? merged.source as PuzzleWord["source"]
    : current?.source ?? "topic";
  const clue = typeof merged.clue === "string" ? merged.clue : null;
  const qualityStatus: PuzzleWord["qualityStatus"] = merged.qualityStatus === "approved" && clue ? "approved" : "unreviewed";
  if (!allowDefaults
    && (merged.source !== source
      || merged.clue !== clue
      || merged.qualityStatus !== qualityStatus)) {
    return null;
  }

  return {
    ...(merged as unknown as PuzzleWord),
    source,
    clue,
    qualityStatus,
  };
}

function decodeBoard(value: unknown, wordIds: Set<string>): PuzzleBoard | null {
  if (!isObject(value) || !Number.isInteger(value.size) || (value.size as number) < 4 || (value.size as number) > 30 || !Array.isArray(value.placements) || !Array.isArray(value.cells)) {
    return null;
  }

  const size = value.size as number;
  const placementsValid = value.placements.every((placement) => isObject(placement)
    && typeof placement.wordId === "string"
    && wordIds.has(placement.wordId)
    && Number.isInteger(placement.row)
    && Number.isInteger(placement.col)
    && (placement.row as number) >= 0
    && (placement.col as number) >= 0
    && (placement.row as number) < size
    && (placement.col as number) < size
    && (placement.direction === "across" || placement.direction === "down")
    && Number.isInteger(placement.clueNumber)
    && (placement.clueNumber as number) > 0);
  const cellsValid = value.cells.every((cell) => isObject(cell)
    && Number.isInteger(cell.row)
    && Number.isInteger(cell.col)
    && (cell.row as number) >= 0
    && (cell.col as number) >= 0
    && (cell.row as number) < size
    && (cell.col as number) < size
    && typeof cell.solution === "string"
    && /^[a-z]$/i.test(cell.solution)
    && Array.isArray(cell.clueNumbers)
    && cell.clueNumbers.every((entry) => Number.isInteger(entry) && entry > 0)
    && isStringArray(cell.wordIds)
    && cell.wordIds.every((wordId) => wordIds.has(wordId)));

  if (!placementsValid || !cellsValid) {
    return null;
  }

  return value as unknown as PuzzleBoard;
}

function decodeRun(value: unknown, nowMs: number, allowLegacyDefaults: boolean): PuzzleRun | null {
  if (!isObject(value)
    || typeof value.id !== "string"
    || !value.id
    || !isIsoTimestamp(value.createdAt)
    || typeof value.seed !== "string"
    || typeof value.title !== "string"
    || typeof value.blurb !== "string"
    || !Array.isArray(value.words)
    || value.words.length === 0) {
    return null;
  }

  const generatorVersion = typeof value.generatorVersion === "number" && Number.isInteger(value.generatorVersion)
    ? value.generatorVersion
    : 1;
  const hasProvenance = typeof value.corpusRevision === "string" && value.corpusRevision.length > 0
    && value.fingerprintVersion === 1 && typeof value.puzzleFingerprint === "string";
  const allowRunDefaults = allowLegacyDefaults || generatorVersion < 3;
  const options = decodeOptions(value.options, nowMs, allowRunDefaults);
  const decodedWords = value.words.map((word) => hydratePuzzleWord(word, allowRunDefaults));
  if (decodedWords.some((word) => word === null)) {
    return null;
  }
  const words = decodedWords as PuzzleWord[];

  const wordIds = new Set(words.map((word) => word.id));
  const board = decodeBoard(value.board, wordIds);
  if (!options || !board || board.placements.length !== words.length) {
    return null;
  }

  return {
    ...(value as unknown as PuzzleRun),
    id: value.id,
    puzzleId: typeof value.puzzleId === "string" && value.puzzleId ? value.puzzleId : value.id,
    generatorVersion,
    corpusRevision: hasProvenance ? value.corpusRevision as string : null,
    fingerprintVersion: hasProvenance ? 1 : null,
    puzzleFingerprint: hasProvenance ? value.puzzleFingerprint as string : null,
    options,
    board,
    words,
  };
}

function decodeAssists(value: unknown, run: PuzzleRun, legacyHintLevels?: unknown): AssistLedger | null {
  const source = isObject(value) ? value : {};
  const hintStepsByWord = decodeNumberRecord(source.hintStepsByWord ?? legacyHintLevels ?? {});
  const revealedCellKeys = isStringArray(source.revealedCellKeys) ? [...new Set(source.revealedCellKeys)] : [];
  const anagramWordIds = isStringArray(source.anagramWordIds) ? [...new Set(source.anagramWordIds)] : [];
  const revealedWordIds = isStringArray(source.revealedWordIds) ? [...new Set(source.revealedWordIds)] : [];
  const puzzleRevealed = source.puzzleRevealed === true;
  const wordIds = new Set(run.words.map((word) => word.id));
  const cellKeys = new Set(run.board.cells.map((cell) => `${cell.row}:${cell.col}`));

  if (!hintStepsByWord
    || Object.keys(hintStepsByWord).some((wordId) => !wordIds.has(wordId))
    || revealedCellKeys.some((key) => !cellKeys.has(key))
    || anagramWordIds.some((wordId) => !wordIds.has(wordId))
    || revealedWordIds.some((wordId) => !wordIds.has(wordId))) {
    return null;
  }

  return {
    hintStepsByWord,
    revealedCellKeys,
    anagramWordIds,
    revealedWordIds,
    puzzleRevealed,
  };
}

function deriveSolvedIds(run: PuzzleRun, cellEntries: Record<string, string>) {
  return run.words.filter((word) => {
    const placement = run.board.placements.find((entry) => entry.wordId === word.id);
    if (!placement) {
      return false;
    }

    const answer = Array.from({ length: word.answer.length }, (_, index) => {
      const row = placement.row + (placement.direction === "down" ? index : 0);
      const col = placement.col + (placement.direction === "across" ? index : 0);
      return cellEntries[`${row}:${col}`] ?? "";
    }).join("").toLowerCase();
    return answer === word.normalized;
  }).map((word) => word.id);
}

function decodeAttempt(value: unknown, nowMs: number, allowLegacyDefaults: boolean, legacyProgress?: ProgressSnapshot): PersistedRunState | null {
  if (!isObject(value)) {
    return null;
  }

  const run = decodeRun(value.run, nowMs, allowLegacyDefaults);
  const cellEntries = decodeStringRecord(value.cellEntries ?? {});
  const guesses = decodeStringRecord(value.guesses ?? {});
  if (!run || !cellEntries || !guesses || typeof value.paused !== "boolean" || typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0) {
    return null;
  }

  const validCellKeys = new Set(run.board.cells.map((cell) => `${cell.row}:${cell.col}`));
  if (Object.entries(cellEntries).some(([key, letter]) => !validCellKeys.has(key) || !/^[a-z]?$/i.test(letter))) {
    return null;
  }

  const solvedIds = deriveSolvedIds(run, cellEntries);
  const wordIds = new Set(run.words.map((word) => word.id));
  const activeWordId = value.activeWordId === null || value.activeWordId === undefined
    ? run.words.find((word) => !solvedIds.includes(word.id))?.id ?? run.words[0]?.id ?? null
    : typeof value.activeWordId === "string" && wordIds.has(value.activeWordId)
      ? value.activeWordId
      : undefined;
  const assists = decodeAssists(value.assists, run, value.hintLevels);
  if (activeWordId === undefined || !assists) {
    return null;
  }

  const startedAt = isIsoTimestamp(value.startedAt)
    ? value.startedAt
    : run.createdAt;
  const legacyAttemptId = `legacy-${run.id}-${startedAt}`;
  const attemptId = typeof value.attemptId === "string" && value.attemptId ? value.attemptId : legacyAttemptId;
  const summary = legacyProgress?.history.find((entry) => entry.puzzleId === run.id || entry.runId === run.id || entry.attemptId === legacyAttemptId);
  const completedAtValue = value.completedAt === null || value.completedAt === undefined
    ? null
    : isIsoTimestamp(value.completedAt)
      ? value.completedAt
      : undefined;
  if (completedAtValue === undefined) {
    return null;
  }

  const completedAt = solvedIds.length === run.words.length
    ? completedAtValue ?? summary?.completedAt ?? new Date(nowMs).toISOString()
    : null;
  const state: PersistedRunState = {
    schemaVersion: runStateSchemaVersion,
    attemptId,
    startedAt,
    completedAt,
    run,
    guesses,
    cellEntries,
    solvedIds,
    activeWordId,
    assists,
    paused: completedAt ? false : value.paused,
    elapsedMs: Math.floor(value.elapsedMs),
    lastTickAt: null,
  };

  return finalizeAttempt(state, nowMs);
}

const legacyRunKeys = ["id", "puzzleId", "generatorVersion", "createdAt", "seed", "options", "title", "blurb", "words", "board"] as const;
const provenanceRunKeys = [
  "id", "puzzleId", "generatorVersion", "corpusRevision", "fingerprintVersion", "puzzleFingerprint", "createdAt", "seed", "options", "title", "blurb", "words", "board",
] as const;
const optionKeys = ["mode", "challenge", "puzzleFamily", "topics", "contentPackId", "puzzleSize", "boardView", "style", "timerEnabled", "learningMode", "seed"] as const;
const wordKeys = [
  "id", "answer", "normalized", "source", "qualityStatus", "clue", "topicId", "topicLabel", "contentPackIds", "difficulty",
  "frequencyBand", "length", "prompt", "microHint", "teaser", "learningNote", "plainMeaning", "pronunciationHint", "usageExample",
  "translationAid", "relatedWords", "visuals", "greekMark", "weight",
] as const;
const boardKeys = ["size", "placements", "cells"] as const;
const placementKeys = ["wordId", "row", "col", "direction", "clueNumber"] as const;
const cellKeys = ["row", "col", "solution", "clueNumbers", "wordIds"] as const;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function recomputeV3PuzzleId(run: PuzzleRun) {
  const identity = [
    "v3",
    run.seed,
    run.options.challenge,
    run.options.puzzleFamily,
    run.options.contentPackId,
    run.options.topics.join(","),
    run.options.puzzleSize,
    run.options.boardView,
    run.words.map((word) => word.id).join(","),
    run.board.placements.map((placement) => `${placement.wordId}:${placement.row}:${placement.col}:${placement.direction}`).join("|"),
  ].join(":");
  return `${hashString(identity)}`;
}

function validBoundedString(value: unknown, maximum = 4_096) {
  return typeof value === "string" && value.length <= maximum;
}

function validateStrictWord(value: unknown) {
  if (!isObject(value) || !hasExactKeys(value, wordKeys) || !hasLegacyPuzzleWordShape(value)) return false;
  const allowedSources = ["topic", "general", "synthetic", "lexicon"];
  const allowedQuality = ["approved", "unreviewed"];
  const allowedDifficulty = ["breeze", "quest", "mythic"];
  const allowedFrequency = ["common", "uncommon", "rare"];
  const boundedFields = ["id", "topicLabel", "prompt", "microHint", "teaser", "learningNote", "plainMeaning", "pronunciationHint", "usageExample", "translationAid", "greekMark"];
  return typeof value.id === "string" && value.id.length > 0 && value.id.length <= 128
    && typeof value.answer === "string" && /^[a-z]{3,14}$/.test(value.answer)
    && value.normalized === value.answer
    && value.length === value.answer.length
    && allowedSources.includes(value.source as string)
    && allowedQuality.includes(value.qualityStatus as string)
    && (value.clue === null || validBoundedString(value.clue))
    && (value.qualityStatus !== "approved" || typeof value.clue === "string")
    && allowedDifficulty.includes(value.difficulty as string)
    && allowedFrequency.includes(value.frequencyBand as string)
    && boundedFields.every((field) => validBoundedString(value[field]))
    && Number.isFinite(value.weight) && (value.weight as number) >= 0
    && (value.contentPackIds as unknown[]).length <= 32
    && (value.relatedWords as unknown[]).length <= 32
    && (value.visuals as unknown[]).length <= 32
    && new Set(value.contentPackIds as string[]).size === (value.contentPackIds as string[]).length;
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function sameNumberSet(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && [...left].sort((a, b) => a - b).every((value, index) => value === [...right].sort((a, b) => a - b)[index]);
}

function validateBoardSemantics(run: PuzzleRun) {
  const { board, words, options } = run;
  if (!isObject(board) || !hasExactKeys(board as unknown as Record<string, unknown>, boardKeys)
    || words.length !== options.puzzleSize || board.placements.length !== words.length
    || board.cells.length > 289 || new Set(words.map((word) => word.id)).size !== words.length
    || new Set(words.map((word) => word.normalized)).size !== words.length) return false;
  if (options.boardView === "quest" ? board.size !== 14 : board.size < 9 || board.size > 17) return false;

  const wordsById = new Map(words.map((word) => [word.id, word]));
  const expected = new Map<string, { solution: string; wordIds: string[]; clueNumbers: number[]; directions: string[] }>();
  const placementIds = new Set<string>();
  for (const [placementIndex, placement] of board.placements.entries()) {
    if (!isObject(placement) || !hasExactKeys(placement as unknown as Record<string, unknown>, placementKeys)
      || placementIds.has(placement.wordId)) return false;
    const word = wordsById.get(placement.wordId);
    if (!word) return false;
    placementIds.add(placement.wordId);
    const rowStep = placement.direction === "down" ? 1 : 0;
    const colStep = placement.direction === "across" ? 1 : 0;
    const endRow = placement.row + rowStep * (word.length - 1);
    const endCol = placement.col + colStep * (word.length - 1);
    if (!inRange(placement.row, board.size) || !inRange(placement.col, board.size)
      || !inRange(endRow, board.size) || !inRange(endCol, board.size)) return false;
    if (options.boardView === "quest" && (placement.direction !== "across" || placement.clueNumber !== placementIndex + 1)) return false;
    for (let index = 0; index < word.length; index += 1) {
      const row = placement.row + rowStep * index;
      const col = placement.col + colStep * index;
      const key = `${row}:${col}`;
      const current = expected.get(key);
      if (current && (current.solution !== word.answer[index] || current.directions.includes(placement.direction))) return false;
      if (current) {
        current.wordIds.push(word.id);
        current.directions.push(placement.direction);
        if (index === 0) current.clueNumbers.push(placement.clueNumber);
      } else {
        expected.set(key, {
          solution: word.answer[index],
          wordIds: [word.id],
          clueNumbers: index === 0 ? [placement.clueNumber] : [],
          directions: [placement.direction],
        });
      }
    }
  }
  if (placementIds.size !== words.length || board.cells.length !== expected.size) return false;
  const seenCells = new Set<string>();
  for (const cell of board.cells) {
    if (!isObject(cell) || !hasExactKeys(cell as unknown as Record<string, unknown>, cellKeys)) return false;
    const key = `${cell.row}:${cell.col}`;
    const wanted = expected.get(key);
    if (!wanted || seenCells.has(key) || cell.solution !== wanted.solution
      || new Set(cell.wordIds).size !== cell.wordIds.length
      || !sameStringSet(cell.wordIds, wanted.wordIds) || !sameNumberSet(cell.clueNumbers, wanted.clueNumbers)) return false;
    seenCells.add(key);
  }

  if (options.boardView === "quest") {
    return new Set(board.placements.map((placement) => placement.row)).size === board.placements.length;
  }

  const ordered = [...board.placements].sort((left, right) => left.row - right.row || left.col - right.col || (left.direction === "across" ? -1 : 1));
  if (ordered.some((placement, index) => placement !== board.placements[index])) return false;
  const clueNumbers = new Map<string, number>();
  let nextClue = 1;
  for (const placement of board.placements) {
    const startKey = `${placement.row}:${placement.col}`;
    if (!clueNumbers.has(startKey)) clueNumbers.set(startKey, nextClue++);
    if (placement.clueNumber !== clueNumbers.get(startKey)) return false;
    const word = wordsById.get(placement.wordId)!;
    const rowStep = placement.direction === "down" ? 1 : 0;
    const colStep = placement.direction === "across" ? 1 : 0;
    const before = `${placement.row - rowStep}:${placement.col - colStep}`;
    const after = `${placement.row + rowStep * word.length}:${placement.col + colStep * word.length}`;
    if (expected.has(before) || expected.has(after)) return false;
    for (let index = 0; index < word.length; index += 1) {
      const row = placement.row + rowStep * index;
      const col = placement.col + colStep * index;
      const entry = expected.get(`${row}:${col}`)!;
      if (entry.wordIds.length > 1) continue;
      const neighbors = placement.direction === "across" ? [`${row - 1}:${col}`, `${row + 1}:${col}`] : [`${row}:${col - 1}`, `${row}:${col + 1}`];
      if (neighbors.some((key) => expected.has(key))) return false;
    }
  }
  const graph = new Map(words.map((word) => [word.id, new Set<string>()]));
  for (const cell of expected.values()) {
    for (const left of cell.wordIds) for (const right of cell.wordIds) if (left !== right) graph.get(left)!.add(right);
  }
  const visited = new Set<string>();
  const pending = [words[0].id];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...graph.get(current)!);
  }
  return visited.size === words.length;
}

function inRange(value: number, size: number) {
  return Number.isInteger(value) && value >= 0 && value < size;
}

function validateStrictRunValue(value: unknown, run: PuzzleRun, shape: "legacy" | "provenance") {
  const expectedKeys = shape === "legacy" ? legacyRunKeys : provenanceRunKeys;
  if (!isObject(value) || !hasExactKeys(value, expectedKeys) || !isObject(value.options) || !hasExactKeys(value.options, optionKeys)
    || !isObject(value.board) || !hasExactKeys(value.board, boardKeys)
    || !Array.isArray(value.words) || !value.words.every(validateStrictWord)
    || !Array.isArray(value.board.placements) || !value.board.placements.every((entry) => isObject(entry) && hasExactKeys(entry, placementKeys))
    || !Array.isArray(value.board.cells) || !value.board.cells.every((entry) => isObject(entry) && hasExactKeys(entry, cellKeys))) return false;
  if (!isCanonicalIsoTimestamp(run.createdAt) || !validBoundedString(run.seed, 256) || !validBoundedString(run.title) || !validBoundedString(run.blurb)
    || ![1, 2, 3].includes(run.generatorVersion) || run.id !== run.puzzleId || !validateBoardSemantics(run)) return false;
  if (run.generatorVersion === 3 && run.puzzleId !== recomputeV3PuzzleId(run)) return false;
  if (shape === "legacy") {
    return run.corpusRevision === null && run.fingerprintVersion === null && run.puzzleFingerprint === null;
  }
  const provenanceAbsent = run.corpusRevision === null && run.fingerprintVersion === null && run.puzzleFingerprint === null;
  return provenanceAbsent || hasVerifiedPuzzleProvenance(run);
}

function deriveGuesses(run: PuzzleRun, cellEntries: Record<string, string>) {
  return Object.fromEntries(run.words.map((word) => {
    const placement = run.board.placements.find((entry) => entry.wordId === word.id)!;
    const value = Array.from({ length: word.length }, (_, index) => {
      const row = placement.row + (placement.direction === "down" ? index : 0);
      const col = placement.col + (placement.direction === "across" ? index : 0);
      return cellEntries[`${row}:${col}`] ?? " ";
    }).join("").trimEnd();
    return [word.id, value];
  }));
}

function canonicalizeAttempt(state: PersistedRunState, nowMs: number) {
  const snapshot = snapshotAttempt(state, nowMs);
  const solvedIds = deriveSolvedIds(snapshot.run, snapshot.cellEntries);
  return finalizeAttempt({
    ...snapshot,
    guesses: deriveGuesses(snapshot.run, snapshot.cellEntries),
    solvedIds,
    lastTickAt: null,
  }, nowMs);
}

function decodeStrictAttempt(value: unknown, nowMs: number, runShape: "legacy" | "provenance") {
  if (!isObject(value) || !hasExactKeys(value, ["schemaVersion", "attemptId", "startedAt", "completedAt", "run", "guesses", "cellEntries", "solvedIds", "activeWordId", "assists", "paused", "elapsedMs", "lastTickAt"])
    || value.schemaVersion !== 2 || value.lastTickAt !== null || !isCanonicalIsoTimestamp(value.startedAt)
    || (value.completedAt !== null && !isCanonicalIsoTimestamp(value.completedAt))
    || !Number.isInteger(value.elapsedMs) || (value.elapsedMs as number) < 0
    || typeof value.attemptId !== "string" || value.attemptId.length === 0 || value.attemptId.length > 160) return null;
  const decoded = decodeAttempt(value, nowMs, false);
  if (!decoded || !validateStrictRunValue(value.run, decoded.run, runShape) || !isObject(value.assists)
    || !hasExactKeys(value.assists, ["hintStepsByWord", "revealedCellKeys", "anagramWordIds", "revealedWordIds", "puzzleRevealed"])) return null;
  const expectedGuesses = deriveGuesses(decoded.run, decoded.cellEntries);
  const expectedSolved = deriveSolvedIds(decoded.run, decoded.cellEntries);
  const completed = expectedSolved.length === decoded.run.words.length;
  if (!sameData(value.guesses, expectedGuesses) || !sameData(value.solvedIds, expectedSolved)
    || completed !== (value.completedAt !== null) || (completed && value.paused === true)
    || (value.completedAt !== null && Date.parse(value.startedAt as string) > Date.parse(value.completedAt as string))) return null;
  const assists = decoded.assists;
  if (new Set(assists.revealedCellKeys).size !== assists.revealedCellKeys.length
    || new Set(assists.anagramWordIds).size !== assists.anagramWordIds.length
    || new Set(assists.revealedWordIds).size !== assists.revealedWordIds.length
    || Object.values(assists.hintStepsByWord).some((level) => level < 1 || level > 3)) return null;
  const cells = new Map(decoded.run.board.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.solution]));
  if (assists.revealedCellKeys.some((key) => decoded.cellEntries[key] !== cells.get(key))) return null;
  if (runShape === "legacy") {
    const { corpusRevision: _corpusRevision, fingerprintVersion: _fingerprintVersion, puzzleFingerprint: _puzzleFingerprint, ...legacyRun } = decoded.run;
    return sameData({ ...decoded, run: legacyRun }, value) ? decoded : null;
  }
  return sameData(decoded, value) ? decoded : null;
}

function decodeStrictProgress(value: unknown, schemaVersion: 2 | 3) {
  const progressKeys = schemaVersion === 2
    ? ["schemaVersion", "streak", "bestStreak", "lastDailySeed", "lastCompletedAt", "history"] as const
    : ["schemaVersion", "streak", "bestStreak", "lastDailySeed", "lastCompletedAt", "dailyLedger", "history"] as const;
  if (!isObject(value) || !hasExactKeys(value, progressKeys)
    || value.schemaVersion !== schemaVersion || !Array.isArray(value.history) || value.history.length > 30) return null;
  const decoded = decodeProgressSnapshot(value);
  if (!decoded || new Set(decoded.history.map((entry) => entry.attemptId)).size !== decoded.history.length) return null;
  if (schemaVersion === 2) {
    const legacyHistory = decoded.history.map((entry) => {
      const {
        generatorVersion: _generatorVersion,
        corpusRevision: _corpusRevision,
        fingerprintVersion: _fingerprintVersion,
        puzzleFingerprint: _puzzleFingerprint,
        dailyOutcome: _dailyOutcome,
        ...legacy
      } = entry;
      const day = entry.seed.replace(/^daily:/, "");
      return {
        ...legacy,
        canonicalDaily: isCanonicalDailyOptions(entry.options, entry.seed)
          && entry.createdAt.slice(0, 10) === day
          && (!entry.finished || entry.completedAt?.slice(0, 10) === day),
      };
    });
    const legacySnapshot = {
      schemaVersion: 2,
      streak: decoded.streak,
      bestStreak: decoded.bestStreak,
      lastDailySeed: decoded.lastDailySeed,
      lastCompletedAt: decoded.lastCompletedAt,
      history: legacyHistory,
    };
    if (!sameData(legacySnapshot, value)) return null;
  } else if (!sameData(decoded, value)) return null;
  if (decoded.lastCompletedAt !== null && !isCanonicalIsoTimestamp(decoded.lastCompletedAt)) return null;
  if (decoded.lastDailySeed !== null && !/^\d{4}-\d{2}-\d{2}$/.test(decoded.lastDailySeed)) return null;
  for (const entry of decoded.history) {
    if (!isCanonicalIsoTimestamp(entry.createdAt) || (entry.completedAt !== null && !isCanonicalIsoTimestamp(entry.completedAt))
      || entry.attemptId.length > 160 || entry.puzzleId.length > 128 || entry.runId.length > 128
      || (entry.corpusRevision !== null && entry.corpusRevision.length > 128)
      || (entry.puzzleFingerprint !== null && !/^p1-[a-f0-9]{64}$/.test(entry.puzzleFingerprint))
      || !Number.isInteger(entry.elapsedMs) || entry.elapsedMs < 0
      || entry.assists.total !== entry.assists.hintSteps + entry.assists.revealedLetters + entry.assists.anagrams + entry.assists.revealedWords + (entry.assists.puzzleRevealed ? 1 : 0)
      || entry.finished !== (entry.solvedCount === entry.totalWords)
      || entry.finished !== (entry.completedAt !== null)) return null;
  }
  return decoded;
}

type DecodedBranch<T> = { status: "valid"; value: T } | { status: "null"; value: null } | { status: "invalid" | "future"; value: null };
type DecodedEnvelope = {
  raw: string;
  saveId: string;
  attempt: DecodedBranch<PersistedRunState>;
  progress: DecodedBranch<ProgressSnapshot>;
  future: boolean;
  full: boolean;
};

function decodeAttemptBranch(value: unknown, nowMs: number): DecodedBranch<PersistedRunState> {
  if (value === null) return { status: "null", value: null };
  if (isObject(value) && ((typeof value.branchVersion === "number" && value.branchVersion > 1) || (typeof value.stateSchemaVersion === "number" && value.stateSchemaVersion > 3))) {
    return { status: "future", value: null };
  }
  if (!isObject(value) || !hasExactKeys(value, ["branchVersion", "stateSchemaVersion", "value"]) || value.branchVersion !== 1
    || (value.stateSchemaVersion !== 2 && value.stateSchemaVersion !== 3)) {
    return { status: "invalid", value: null };
  }
  if (utf8Bytes(JSON.stringify(value.value)) > maxV3AttemptBranchBytes) return { status: "invalid", value: null };
  const decoded = decodeStrictAttempt(value.value, nowMs, value.stateSchemaVersion === 2 ? "legacy" : "provenance");
  return decoded ? { status: "valid", value: decoded } : { status: "invalid", value: null };
}

function decodeProgressBranch(value: unknown): DecodedBranch<ProgressSnapshot> {
  if (isObject(value) && ((typeof value.branchVersion === "number" && value.branchVersion > 1) || (typeof value.stateSchemaVersion === "number" && value.stateSchemaVersion > 3))) {
    return { status: "future", value: null };
  }
  if (!isObject(value) || !hasExactKeys(value, ["branchVersion", "stateSchemaVersion", "value"]) || value.branchVersion !== 1
    || (value.stateSchemaVersion !== 2 && value.stateSchemaVersion !== 3)) {
    return { status: "invalid", value: null };
  }
  if (utf8Bytes(JSON.stringify(value.value)) > maxV3ProgressBranchBytes) return { status: "invalid", value: null };
  const decoded = decodeStrictProgress(value.value, value.stateSchemaVersion);
  return decoded ? { status: "valid", value: decoded } : { status: "invalid", value: null };
}

function decodeV3Envelope(raw: string | null, nowMs: number): DecodedEnvelope | null {
  if (!raw || utf8Bytes(raw) > maxV3EnvelopeBytes) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (isObject(value) && typeof value.storageVersion === "number" && value.storageVersion > 3) {
      return { raw, saveId: "future", attempt: { status: "future", value: null }, progress: { status: "future", value: null }, future: true, full: false };
    }
    if (!isObject(value) || !hasExactKeys(value, ["format", "storageVersion", "saveId", "savedAt", "branches"])
      || value.format !== "astra-lexa/local-save" || value.storageVersion !== 3
      || typeof value.saveId !== "string" || !/^save-[a-z0-9-]{8,160}$/i.test(value.saveId)
      || !isCanonicalIsoTimestamp(value.savedAt) || !isObject(value.branches)
      || !hasExactKeys(value.branches, ["attempt", "progress"])) return null;
    const attempt = decodeAttemptBranch(value.branches.attempt, nowMs);
    const progress = decodeProgressBranch(value.branches.progress);
    const future = attempt.status === "future" || progress.status === "future";
    return {
      raw,
      saveId: value.saveId,
      attempt,
      progress,
      future,
      full: !future && (attempt.status === "valid" || attempt.status === "null") && progress.status === "valid",
    };
  } catch {
    return null;
  }
}

export function createPortableBackup(
  state: PersistedRunState | null,
  progress: ProgressSnapshot,
  nowMs = Date.now(),
): PortableBackupCodecResult {
  try {
    const envelopeRaw = serializeStoredGame(state, progress, nowMs, createSaveId(nowMs, `save-backup-${nowMs.toString(36)}-0000`));
    const envelope = decodeV3Envelope(envelopeRaw, nowMs);
    if (!envelope?.full) return { ok: false, code: "candidate-invalid" };
    const raw = JSON.stringify({
      format: "astra-lexa/portable-backup",
      backupVersion: 1,
      exportedAt: new Date(nowMs).toISOString(),
      containsAnswers: true,
      envelope: JSON.parse(envelopeRaw) as unknown,
    });
    const bytes = utf8Bytes(raw);
    return bytes <= maxPortableBackupBytes
      ? { ok: true, raw, bytes, filename: `astra-lexa-backup-${new Date(nowMs).toISOString().slice(0, 10)}.json` }
      : { ok: false, code: "candidate-too-large" };
  } catch {
    return { ok: false, code: "candidate-invalid" };
  }
}

function envelopeHasFuturePuzzleVersion(value: unknown) {
  if (!isObject(value) || !isObject(value.branches) || !isObject(value.branches.attempt)
    || !isObject(value.branches.attempt.value) || !isObject(value.branches.attempt.value.run)) return false;
  const run = value.branches.attempt.value.run;
  return (typeof run.generatorVersion === "number" && run.generatorVersion > 3)
    || (typeof run.fingerprintVersion === "number" && run.fingerprintVersion > 1);
}

export function previewPortableBackup(raw: string, nowMs = Date.now()): PortableBackupPreviewResult {
  if (utf8Bytes(raw) > maxPortableBackupBytes) return { ok: false, code: "backup-too-large" };
  try {
    const value = JSON.parse(raw) as unknown;
    if (isObject(value) && typeof value.backupVersion === "number" && value.backupVersion > 1) {
      return { ok: false, code: "future-version" };
    }
    if (!isObject(value) || !hasExactKeys(value, ["format", "backupVersion", "exportedAt", "containsAnswers", "envelope"])
      || value.format !== "astra-lexa/portable-backup" || value.backupVersion !== 1 || value.containsAnswers !== true
      || !isCanonicalIsoTimestamp(value.exportedAt) || !isObject(value.envelope)) {
      return { ok: false, code: "invalid-backup" };
    }
    if (envelopeHasFuturePuzzleVersion(value.envelope)) return { ok: false, code: "future-version" };
    const envelopeRaw = JSON.stringify(value.envelope);
    const envelope = decodeV3Envelope(envelopeRaw, nowMs);
    if (envelope?.future) return { ok: false, code: "future-version" };
    if (!envelope?.full || envelope.progress.status !== "valid"
      || (envelope.attempt.status !== "valid" && envelope.attempt.status !== "null")) {
      return { ok: false, code: "invalid-backup" };
    }
    const attempt = envelope.attempt.status === "valid" ? envelope.attempt.value : null;
    const progress = envelope.progress.value;
    return {
      ok: true,
      candidate: {
        envelopeRaw,
        preview: {
          exportedAt: value.exportedAt,
          bytes: utf8Bytes(raw),
          attemptStatus: attempt === null ? "none" : attempt.completedAt ? "completed" : "unfinished",
          historyCount: progress.history.length,
          creditedDays: Object.values(progress.dailyLedger).filter((outcome) => outcome === "credited").length,
          lateClearDays: Object.values(progress.dailyLedger).filter((outcome) => outcome === "late-clear").length,
        },
      },
    };
  } catch {
    return { ok: false, code: "invalid-backup" };
  }
}

function reEnvelopeRaw(raw: string, saveId: string, nowMs: number) {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value)) return null;
    const candidateRaw = JSON.stringify({ ...value, saveId, savedAt: new Date(nowMs).toISOString() });
    const candidate = decodeV3Envelope(candidateRaw, nowMs);
    return candidate?.full && candidate.saveId === saveId ? candidateRaw : null;
  } catch {
    return null;
  }
}

function decodeImportUndo(raw: string | null, nowMs: number) {
  if (!raw || utf8Bytes(raw) > maxV3EnvelopeBytes + 2_048) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || !hasExactKeys(value, ["format", "undoVersion", "importedSaveId", "capturedAt", "previousEnvelopeRaw"])
      || value.format !== "astra-lexa/import-undo" || value.undoVersion !== 1
      || typeof value.importedSaveId !== "string" || !isCanonicalIsoTimestamp(value.capturedAt)
      || typeof value.previousEnvelopeRaw !== "string" || !decodeV3Envelope(value.previousEnvelopeRaw, nowMs)?.full) return null;
    return value as unknown as PortableImportUndo;
  } catch {
    return null;
  }
}

export function hasPortableImportUndo(storage: Pick<Storage, "getItem">, committedSaveId: string | null, nowMs = Date.now()) {
  if (!committedSaveId) return false;
  try {
    return decodeImportUndo(storage.getItem(storageV3ImportUndoKey), nowMs)?.importedSaveId === committedSaveId;
  } catch {
    return false;
  }
}

function advanceImportUndo(storage: Pick<Storage, "getItem" | "setItem">, previousSaveId: string | null, nextSaveId: string, nowMs: number) {
  if (!previousSaveId) return;
  try {
    const undo = decodeImportUndo(storage.getItem(storageV3ImportUndoKey), nowMs);
    if (!undo || undo.importedSaveId !== previousSaveId) return;
    const nextRaw = JSON.stringify({ ...undo, importedSaveId: nextSaveId });
    storage.setItem(storageV3ImportUndoKey, nextRaw);
  } catch {
    // A lifecycle save remains valid even if its optional import-undo receipt expires.
  }
}

function decodeCommitMarker(raw: string | null) {
  if (!raw || utf8Bytes(raw) > 512) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || !hasExactKeys(value, ["format", "markerVersion", "storageVersion", "committedSaveId", "pendingSaveId"])
      || value.format !== "astra-lexa/local-save-commit" || value.markerVersion !== 1 || value.storageVersion !== 3
      || !(value.committedSaveId === null || typeof value.committedSaveId === "string")
      || !(value.pendingSaveId === null || typeof value.pendingSaveId === "string")) return null;
    return value as unknown as StorageCommitMarker;
  } catch {
    return null;
  }
}

export function decodePersistedGame(raw: string, nowMs = Date.now()): PersistedGame | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.schemaVersion !== 2) {
      return null;
    }

    const progress = isObject(value.progress) && value.progress.schemaVersion === 2
      ? decodeProgressSnapshot(value.progress)
      : null;
    const currentAttempt = decodeAttempt(value.currentAttempt, nowMs, false, progress ?? undefined);
    if (!progress || !currentAttempt || currentAttempt.schemaVersion !== 2) {
      return null;
    }

    return {
      schemaVersion: 2,
      currentAttempt,
      progress,
    };
  } catch {
    return null;
  }
}

export function migrateLegacyGame(sessionRaw: string | null, progress: ProgressSnapshot, nowMs = Date.now()): PersistedGame | null {
  if (!sessionRaw) {
    return null;
  }

  try {
    const legacyValue = JSON.parse(sessionRaw) as unknown;
    const currentAttempt = decodeAttempt(legacyValue, nowMs, true, progress);
    if (!currentAttempt) {
      return null;
    }

    return {
      schemaVersion: 2,
      currentAttempt,
      progress,
    };
  } catch {
    return null;
  }
}

type MigratedBranches = {
  currentAttempt: PersistedRunState | null;
  progress: ProgressSnapshot | null;
};

function migrateV2Branches(raw: string | null, nowMs: number): MigratedBranches | null {
  if (!raw || utf8Bytes(raw) > maxV3EnvelopeBytes) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.schemaVersion !== 2) return null;
    const progress = isObject(value.progress) && value.progress.schemaVersion === 2
      ? decodeProgressSnapshot(value.progress)
      : null;
    const attempt = decodeAttempt(value.currentAttempt, nowMs, false, progress ?? undefined);
    if (!attempt && !progress) return null;
    return { currentAttempt: attempt ? canonicalizeAttempt(attempt, nowMs) : null, progress };
  } catch {
    return null;
  }
}

function decodeLegacyProgressRaw(raw: string | null) {
  if (!raw || utf8Bytes(raw) > maxV3ProgressBranchBytes) return null;
  try {
    return decodeProgressSnapshot(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function readMigrationSources(storage: Pick<Storage, "getItem">, nowMs: number): StoredGameResult {
  try {
    const v2 = migrateV2Branches(storage.getItem(gameStorageKey), nowMs);
    if (v2) {
      const issues: StorageReadIssue[] = [];
      if (!v2.currentAttempt) issues.push("attempt-unavailable");
      if (!v2.progress) issues.push("progress-reset");
      return {
        currentAttempt: v2.currentAttempt,
        progress: v2.progress ?? createEmptyStorageProgress(),
        source: "v2-migrated",
        committedSaveId: null,
        adopted: false,
        writable: true,
        issues,
      };
    }
    const legacyProgress = decodeLegacyProgressRaw(storage.getItem(legacyProgressStorageKey));
    const legacy = migrateLegacyGame(storage.getItem(legacySessionStorageKey), legacyProgress ?? createEmptyStorageProgress(), nowMs);
    if (legacy || legacyProgress) {
      return {
        currentAttempt: legacy ? canonicalizeAttempt(legacy.currentAttempt, nowMs) : null,
        progress: legacy?.progress ?? legacyProgress ?? createEmptyStorageProgress(),
        source: "legacy-migrated",
        committedSaveId: null,
        adopted: false,
        writable: true,
        issues: legacy ? [] : ["attempt-unavailable"],
      };
    }
    return {
      currentAttempt: null,
      progress: createEmptyStorageProgress(),
      source: "none",
      committedSaveId: null,
      adopted: false,
      writable: true,
      issues: [],
    };
  } catch {
    return {
      currentAttempt: null,
      progress: createEmptyStorageProgress(),
      source: "recovery",
      committedSaveId: null,
      adopted: false,
      writable: false,
      issues: ["read-denied"],
    };
  }
}

function createEmptyStorageProgress(): ProgressSnapshot {
  return {
    schemaVersion: 3,
    streak: 0,
    bestStreak: 0,
    lastDailySeed: null,
    lastCompletedAt: null,
    dailyLedger: {},
    history: [],
  };
}

function resolveEnvelopeBranches(
  candidates: Array<{ envelope: DecodedEnvelope; source: "primary" | "previous" }>,
  committedSaveId: string | null,
  issues: StorageReadIssue[],
  adopted: boolean,
  forceReadOnly: boolean,
): StoredGameResult {
  let currentAttempt: PersistedRunState | null = null;
  let attemptResolved = false;
  let progress: ProgressSnapshot | null = null;
  let attemptSource: "primary" | "previous" | null = null;
  let progressSource: "primary" | "previous" | null = null;
  for (const candidate of candidates) {
    if (!attemptResolved && candidate.envelope.attempt.status === "null") {
      attemptResolved = true;
      attemptSource = candidate.source;
    } else if (!attemptResolved && candidate.envelope.attempt.status === "valid") {
      currentAttempt = candidate.envelope.attempt.value;
      attemptResolved = true;
      attemptSource = candidate.source;
    }
    if (!progress && candidate.envelope.progress.status === "valid") {
      progress = candidate.envelope.progress.value;
      progressSource = candidate.source;
    }
  }
  if (!attemptResolved) issues.push("attempt-unavailable");
  if (!progress) issues.push("progress-reset");
  const usedSources = new Set([attemptSource, progressSource].filter(Boolean));
  const source = usedSources.size > 1
    ? "v3-mixed" as const
    : usedSources.has("primary")
      ? "v3-primary" as const
      : usedSources.has("previous")
        ? "v3-previous" as const
        : "recovery" as const;
  if (source === "v3-previous" && !issues.includes("recovered-previous")) issues.push("recovered-previous");
  if (source === "v3-mixed" && !issues.includes("recovered-mixed")) issues.push("recovered-mixed");
  const hasFullBase = candidates.some((candidate) => candidate.envelope.full);
  if (!hasFullBase && adopted) issues.push("recovery-required");
  return {
    currentAttempt,
    progress: progress ?? createEmptyStorageProgress(),
    source,
    committedSaveId,
    adopted,
    writable: !forceReadOnly && hasFullBase,
    issues: [...new Set(issues)],
  };
}

function markerIsFuture(raw: string | null) {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as unknown;
    return isObject(value) && ((typeof value.storageVersion === "number" && value.storageVersion > 3)
      || (typeof value.markerVersion === "number" && value.markerVersion > 1));
  } catch {
    return false;
  }
}

export function readStoredGame(storage: Pick<Storage, "getItem">, nowMs = Date.now()): StoredGameResult {
  let markerRaw: string | null;
  let primaryRaw: string | null;
  let previousRaw: string | null;
  try {
    markerRaw = storage.getItem(storageV3CommitKey);
    primaryRaw = storage.getItem(storageV3PrimaryKey);
    previousRaw = storage.getItem(storageV3PreviousKey);
  } catch {
    return {
      currentAttempt: null,
      progress: createEmptyStorageProgress(),
      source: "recovery",
      committedSaveId: null,
      adopted: true,
      writable: false,
      issues: ["read-denied", "recovery-required"],
    };
  }

  const anyV3 = markerRaw !== null || primaryRaw !== null || previousRaw !== null;
  const marker = decodeCommitMarker(markerRaw);
  const primary = decodeV3Envelope(primaryRaw, nowMs);
  const previous = decodeV3Envelope(previousRaw, nowMs);
  if (!anyV3) return readMigrationSources(storage, nowMs);

  if (marker?.committedSaveId) {
    const issues: StorageReadIssue[] = [];
    if (primaryRaw && !primary) issues.push("malformed-primary");
    if (previousRaw && !previous) issues.push("malformed-previous");
    const future = markerIsFuture(markerRaw) || primary?.future === true || previous?.future === true;
    if (future) issues.push("future-version");
    const candidates: Array<{ envelope: DecodedEnvelope; source: "primary" | "previous" }> = [];
    if (primary?.saveId === marker.committedSaveId) candidates.push({ envelope: primary, source: "primary" });
    if (previous?.saveId === marker.committedSaveId) candidates.push({ envelope: previous, source: "previous" });
    if (previous && !candidates.some((candidate) => candidate.envelope === previous)) candidates.push({ envelope: previous, source: "previous" });
    return resolveEnvelopeBranches(candidates, marker.committedSaveId, issues, true, future);
  }

  if (marker && marker.committedSaveId === null) {
    if (marker.pendingSaveId && primary?.saveId === marker.pendingSaveId && primary.full) {
      return resolveEnvelopeBranches([{ envelope: primary, source: "primary" }], null, ["recovered-pending"], false, true);
    }
    const migrated = readMigrationSources(storage, nowMs);
    if (migrated.source !== "none") {
      return marker.pendingSaveId
        ? { ...migrated, issues: [...migrated.issues, "interrupted-adoption"] }
        : migrated;
    }
  }

  const issues: StorageReadIssue[] = [markerIsFuture(markerRaw) || primary?.future || previous?.future ? "future-version" : "recovery-required"];
  if (primaryRaw && !primary) issues.push("malformed-primary");
  if (previousRaw && !previous) issues.push("malformed-previous");
  const candidates: Array<{ envelope: DecodedEnvelope; source: "primary" | "previous" }> = [];
  if (primary) candidates.push({ envelope: primary, source: "primary" });
  if (previous) candidates.push({ envelope: previous, source: "previous" });
  return resolveEnvelopeBranches(candidates, null, issues, true, true);
}

function createSaveId(nowMs: number, supplied?: string) {
  if (supplied) return supplied;
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `save-${nowMs.toString(36)}-${random}`;
}

export function serializeStoredGame(
  state: PersistedRunState | null,
  progress: ProgressSnapshot,
  nowMs = Date.now(),
  saveId = createSaveId(nowMs),
) {
  const envelope: StorageEnvelopeV3 = {
    format: "astra-lexa/local-save",
    storageVersion: 3,
    saveId,
    savedAt: new Date(nowMs).toISOString(),
    branches: {
      attempt: state ? {
        branchVersion: 1,
        stateSchemaVersion: 3,
        value: canonicalizeAttempt(state, nowMs),
      } : null,
      progress: {
        branchVersion: 1,
        stateSchemaVersion: 3,
        value: progress,
      },
    },
  };
  return JSON.stringify(envelope);
}

export function stagePagehideSnapshot(
  storage: Pick<Storage, "getItem" | "setItem">,
  state: PersistedRunState,
  progress: ProgressSnapshot,
  nowMs: number,
  options: { baseSaveId: string | null; writerId: string },
): PagehideStageResult {
  const saveId = `save-pagehide-${nowMs.toString(36)}-${options.writerId}`;
  let candidateRaw: string;
  try {
    candidateRaw = serializeStoredGame(state, progress, nowMs, saveId);
  } catch {
    return { ok: false, code: "candidate-invalid" };
  }
  if (utf8Bytes(candidateRaw) > maxV3EnvelopeBytes) return { ok: false, code: "candidate-too-large" };
  if (!decodeV3Envelope(candidateRaw, nowMs)?.full) return { ok: false, code: "candidate-invalid" };
  const snapshot: PagehideSnapshot = {
    format: "astra-lexa/pagehide-save",
    snapshotVersion: 1,
    baseSaveId: options.baseSaveId,
    capturedAt: new Date(nowMs).toISOString(),
    candidateRaw,
  };
  const raw = JSON.stringify(snapshot);
  const key = `${storageV3PagehidePrefix}${options.writerId}`;
  try {
    storage.setItem(key, raw);
    return storage.getItem(key) === raw ? { ok: true, key } : { ok: false, code: "readback-mismatch" };
  } catch (error) {
    return { ok: false, code: classifyStorageError(error) };
  }
}

function decodePagehideSnapshot(raw: string | null, nowMs: number) {
  if (!raw || utf8Bytes(raw) > maxV3EnvelopeBytes + 1_024) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || !hasExactKeys(value, ["format", "snapshotVersion", "baseSaveId", "capturedAt", "candidateRaw"])
      || value.format !== "astra-lexa/pagehide-save" || value.snapshotVersion !== 1
      || !(value.baseSaveId === null || typeof value.baseSaveId === "string")
      || !isCanonicalIsoTimestamp(value.capturedAt) || typeof value.candidateRaw !== "string") return null;
    const candidate = decodeV3Envelope(value.candidateRaw, nowMs);
    if (!candidate?.full || candidate.attempt.status !== "valid" || candidate.progress.status !== "valid") return null;
    return { snapshot: value as unknown as PagehideSnapshot, candidate };
  } catch {
    return null;
  }
}

function classifyStorageError(error: unknown): "quota-exceeded" | "write-denied" {
  return error instanceof DOMException && error.name === "QuotaExceededError" ? "quota-exceeded" : "write-denied";
}

function writeFailure(
  code: StorageFailureCode,
  stage: Exclude<StorageWriteResult, { ok: true }>["stage"],
  preservation: Exclude<StorageWriteResult, { ok: true }>["preservation"] = "unchanged",
): Exclude<StorageWriteResult, { ok: true }> {
  return { ok: false, code, stage, preservation, retryable: !["future-version", "commit-uncertain", "recovery-required"].includes(code) };
}

function commitRawEnvelopeUnlocked(
  storage: Pick<Storage, "getItem" | "setItem">,
  candidateRaw: string,
  nowMs: number,
  options: { expectedSaveId?: string | null } = {},
): StorageWriteResult {
  const bytes = utf8Bytes(candidateRaw);
  if (bytes > maxV3EnvelopeBytes) return writeFailure("candidate-too-large", "preflight");
  const candidate = decodeV3Envelope(candidateRaw, nowMs);
  if (!candidate?.full) return writeFailure("candidate-invalid", "preflight");
  const saveId = candidate.saveId;

  let markerRaw: string | null;
  let primaryRaw: string | null;
  let previousRaw: string | null;
  try {
    markerRaw = storage.getItem(storageV3CommitKey);
    primaryRaw = storage.getItem(storageV3PrimaryKey);
    previousRaw = storage.getItem(storageV3PreviousKey);
  } catch {
    return writeFailure("read-denied", "preflight");
  }
  const anyV3 = markerRaw !== null || primaryRaw !== null || previousRaw !== null;
  const marker = decodeCommitMarker(markerRaw);
  if (anyV3 && !marker) return writeFailure(markerIsFuture(markerRaw) ? "future-version" : "recovery-required", "preflight");
  if (marker?.committedSaveId === null && marker.pendingSaveId !== null) {
    return writeFailure("recovery-required", "preflight");
  }
  const committedSaveId = marker?.committedSaveId ?? null;
  if (options.expectedSaveId !== undefined && options.expectedSaveId !== committedSaveId) {
    return writeFailure("concurrent-write", "preflight");
  }
  const primary = decodeV3Envelope(primaryRaw, nowMs);
  const previous = decodeV3Envelope(previousRaw, nowMs);
  if (primary?.future || previous?.future) return writeFailure("future-version", "preflight");
  const base = committedSaveId
    ? [primary, previous].find((envelope) => envelope?.saveId === committedSaveId && envelope.full)
      ?? (previous?.full ? previous : null)
    : null;
  if (committedSaveId && !base) return writeFailure("recovery-required", "preflight");

  if (base) {
    try {
      storage.setItem(storageV3PreviousKey, base.raw);
      const readback = storage.getItem(storageV3PreviousKey);
      const verified = decodeV3Envelope(readback, nowMs);
      if (readback !== base.raw || !verified?.full || verified.saveId !== base.saveId) {
        return writeFailure("readback-mismatch", "backup");
      }
    } catch (error) {
      return writeFailure(classifyStorageError(error), "backup");
    }
  }

  const prepareMarker: StorageCommitMarker = {
    format: "astra-lexa/local-save-commit",
    markerVersion: 1,
    storageVersion: 3,
    committedSaveId,
    pendingSaveId: saveId,
  };
  const prepareRaw = JSON.stringify(prepareMarker);
  try {
    storage.setItem(storageV3CommitKey, prepareRaw);
    if (storage.getItem(storageV3CommitKey) !== prepareRaw) return writeFailure("readback-mismatch", "prepare", base ? "previous-valid" : "unchanged");
  } catch (error) {
    return writeFailure(classifyStorageError(error), "prepare", base ? "previous-valid" : "unchanged");
  }

  try {
    storage.setItem(storageV3PrimaryKey, candidateRaw);
    const readback = storage.getItem(storageV3PrimaryKey);
    const verified = decodeV3Envelope(readback, nowMs);
    if (readback !== candidateRaw || !verified?.full || verified.saveId !== saveId) {
      return writeFailure("verification-failed", "primary", base ? "previous-valid" : "unchanged");
    }
  } catch (error) {
    return writeFailure(classifyStorageError(error), "primary", base ? "previous-valid" : "unchanged");
  }

  try {
    if (storage.getItem(storageV3CommitKey) !== prepareRaw) return writeFailure("concurrent-write", "commit", base ? "previous-valid" : "unchanged");
  } catch {
    return writeFailure("read-denied", "commit", base ? "previous-valid" : "unchanged");
  }
  const committedMarker: StorageCommitMarker = { ...prepareMarker, committedSaveId: saveId, pendingSaveId: null };
  const committedRaw = JSON.stringify(committedMarker);
  try {
    storage.setItem(storageV3CommitKey, committedRaw);
    if (storage.getItem(storageV3CommitKey) !== committedRaw) return writeFailure("commit-uncertain", "commit", "commit-uncertain");
  } catch (error) {
    return writeFailure(classifyStorageError(error), "commit", base ? "previous-valid" : "unchanged");
  }
  return { ok: true, saveId, bytes };
}

function writeStoredGameUnlocked(
  storage: Pick<Storage, "getItem" | "setItem">,
  state: PersistedRunState,
  progress: ProgressSnapshot,
  nowMs = Date.now(),
  options: { expectedSaveId?: string | null; saveId?: string } = {},
): StorageWriteResult {
  const saveId = createSaveId(nowMs, options.saveId);
  let candidateRaw: string;
  try {
    candidateRaw = serializeStoredGame(state, progress, nowMs, saveId);
  } catch {
    return writeFailure("candidate-invalid", "preflight");
  }
  return commitRawEnvelopeUnlocked(storage, candidateRaw, nowMs, options);
}

const storageCoordinatorLockName = "astra-lexa:v3:commit";
const storageCoordinatorDbName = "astra-lexa-coordinator";
const storageCoordinatorStoreName = "mutexes";
const storageCoordinatorRecordKey = "astra-lexa:v3";
const storageCoordinatorTimeoutMs = 2_000;
let coordinatorDatabasePromise: Promise<IDBDatabase> | null = null;
let inProcessCoordinatorTail = Promise.resolve();

function openCoordinatorDatabase() {
  if (coordinatorDatabasePromise) return coordinatorDatabasePromise;
  coordinatorDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(storageCoordinatorDbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storageCoordinatorStoreName)) {
        request.result.createObjectStore(storageCoordinatorStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage coordinator."));
    request.onblocked = () => reject(new Error("Storage coordinator upgrade was blocked."));
  });
  return coordinatorDatabasePromise;
}

async function runWithIndexedDbCoordinator<T>(callback: () => T) {
  const database = await openCoordinatorDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storageCoordinatorStoreName, "readwrite");
    const store = transaction.objectStore(storageCoordinatorStoreName);
    const request = store.get(storageCoordinatorRecordKey);
    let result: T | undefined;
    request.onsuccess = () => {
      try {
        result = callback();
        store.put({ id: storageCoordinatorRecordKey, touchedAt: Date.now() });
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    request.onerror = () => {
      transaction.abort();
      reject(request.error ?? new Error("Could not acquire storage coordinator."));
    };
    transaction.oncomplete = () => {
      if (result === undefined) reject(new Error("Storage coordinator completed without a result."));
      else resolve(result);
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Storage coordinator failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Storage coordinator aborted."));
  });
}

async function runWithInProcessCoordinator<T>(callback: () => T) {
  const previous = inProcessCoordinatorTail;
  let release = () => {};
  inProcessCoordinatorTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return callback();
  } finally {
    release();
  }
}

async function runWithStorageCoordinator<T>(callback: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), storageCoordinatorTimeoutMs);
    try {
      return await navigator.locks.request(storageCoordinatorLockName, { mode: "exclusive", signal: controller.signal }, callback);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
  if (typeof indexedDB !== "undefined") return runWithIndexedDbCoordinator(callback);
  if (typeof window === "undefined") return runWithInProcessCoordinator(callback);
  throw new Error("No cross-tab storage coordinator is available.");
}

export async function writeStoredGame(
  storage: Pick<Storage, "getItem" | "setItem">,
  state: PersistedRunState,
  progress: ProgressSnapshot,
  nowMs = Date.now(),
  options: { expectedSaveId?: string | null; saveId?: string } = {},
): Promise<StorageWriteResult> {
  try {
    return await runWithStorageCoordinator(() => writeStoredGameUnlocked(storage, state, progress, nowMs, options));
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return writeFailure(timedOut ? "lock-timeout" : "coordination-unavailable", "preflight");
  }
}

function readCommittedEnvelopeRaw(storage: Pick<Storage, "getItem">, committedSaveId: string, nowMs: number) {
  for (const key of [storageV3PrimaryKey, storageV3PreviousKey]) {
    const raw = storage.getItem(key);
    const decoded = decodeV3Envelope(raw, nowMs);
    if (decoded?.full && decoded.saveId === committedSaveId) return raw;
  }
  return null;
}

function portableSuccess(candidateRaw: string, result: Extract<StorageWriteResult, { ok: true }>, nowMs: number, undoAvailable: boolean): PortableStorageResult {
  const decoded = decodeV3Envelope(candidateRaw, nowMs);
  if (!decoded?.full || decoded.progress.status !== "valid"
    || (decoded.attempt.status !== "valid" && decoded.attempt.status !== "null")) {
    return writeFailure("verification-failed", "commit", "commit-uncertain");
  }
  return {
    ...result,
    currentAttempt: decoded.attempt.status === "valid" ? decoded.attempt.value : null,
    progress: decoded.progress.value,
    undoAvailable,
  };
}

function coordinationFailure(error: unknown) {
  const timedOut = error instanceof DOMException && error.name === "AbortError";
  return writeFailure(timedOut ? "lock-timeout" : "coordination-unavailable", "preflight");
}

function restoreUndoRaw(storage: Storage, raw: string | null) {
  try {
    if (raw === null) storage.removeItem(storageV3ImportUndoKey);
    else storage.setItem(storageV3ImportUndoKey, raw);
  } catch {
    // Canonical data remains authoritative even if an expired undo receipt cannot be restored.
  }
}

export async function importPortableBackup(
  storage: Storage,
  candidate: PortableBackupCandidate,
  options: { expectedSaveId: string | null },
  nowMs = Date.now(),
): Promise<PortableStorageResult> {
  try {
    return await runWithStorageCoordinator(() => {
      const source = decodeV3Envelope(candidate.envelopeRaw, nowMs);
      if (!source?.full || source.progress.status !== "valid"
        || (source.attempt.status !== "valid" && source.attempt.status !== "null")) {
        return writeFailure("candidate-invalid", "preflight");
      }
      const current = readStoredGame(storage, nowMs);
      if (!current.writable) {
        return writeFailure(current.issues.includes("future-version") ? "future-version" : "recovery-required", "preflight");
      }
      if (current.committedSaveId !== options.expectedSaveId) return writeFailure("concurrent-write", "preflight");

      let previousEnvelopeRaw: string;
      try {
        previousEnvelopeRaw = current.committedSaveId
          ? readCommittedEnvelopeRaw(storage, current.committedSaveId, nowMs) ?? ""
          : serializeStoredGame(current.currentAttempt, current.progress, nowMs, `save-undo-base-${nowMs.toString(36)}-0000`);
      } catch {
        return writeFailure("candidate-invalid", "preflight");
      }
      if (!decodeV3Envelope(previousEnvelopeRaw, nowMs)?.full) return writeFailure("recovery-required", "preflight");

      const saveId = createSaveId(nowMs, `save-import-${nowMs.toString(36)}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`);
      const candidateRaw = reEnvelopeRaw(candidate.envelopeRaw, saveId, nowMs);
      if (!candidateRaw) return writeFailure("candidate-invalid", "preflight");
      const undo: PortableImportUndo = {
        format: "astra-lexa/import-undo",
        undoVersion: 1,
        importedSaveId: saveId,
        capturedAt: new Date(nowMs).toISOString(),
        previousEnvelopeRaw,
      };
      const undoRaw = JSON.stringify(undo);
      if (utf8Bytes(undoRaw) > maxV3EnvelopeBytes + 2_048) return writeFailure("candidate-too-large", "preflight");
      let oldUndoRaw: string | null;
      try {
        oldUndoRaw = storage.getItem(storageV3ImportUndoKey);
        storage.setItem(storageV3ImportUndoKey, undoRaw);
        if (storage.getItem(storageV3ImportUndoKey) !== undoRaw || !decodeImportUndo(undoRaw, nowMs)) {
          restoreUndoRaw(storage, oldUndoRaw);
          return writeFailure("readback-mismatch", "backup");
        }
      } catch (error) {
        return writeFailure(classifyStorageError(error), "backup");
      }

      const result = commitRawEnvelopeUnlocked(storage, candidateRaw, nowMs, { expectedSaveId: options.expectedSaveId });
      if (!result.ok) {
        if (result.code !== "commit-uncertain") {
          restoreUndoRaw(storage, oldUndoRaw);
        }
        return result;
      }
      return portableSuccess(candidateRaw, result, nowMs, true);
    });
  } catch (error) {
    return coordinationFailure(error);
  }
}

export async function undoPortableImport(
  storage: Storage,
  options: { expectedSaveId: string },
  nowMs = Date.now(),
): Promise<PortableStorageResult> {
  try {
    return await runWithStorageCoordinator(() => {
      let undo: PortableImportUndo | null;
      try {
        undo = decodeImportUndo(storage.getItem(storageV3ImportUndoKey), nowMs);
      } catch {
        return writeFailure("read-denied", "preflight");
      }
      if (!undo || undo.importedSaveId !== options.expectedSaveId) return writeFailure("recovery-required", "preflight");
      const current = readStoredGame(storage, nowMs);
      if (!current.writable || current.committedSaveId !== options.expectedSaveId) return writeFailure("concurrent-write", "preflight");
      const saveId = createSaveId(nowMs, `save-undo-${nowMs.toString(36)}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`);
      const candidateRaw = reEnvelopeRaw(undo.previousEnvelopeRaw, saveId, nowMs);
      if (!candidateRaw) return writeFailure("candidate-invalid", "preflight");
      const result = commitRawEnvelopeUnlocked(storage, candidateRaw, nowMs, { expectedSaveId: options.expectedSaveId });
      if (!result.ok) return result;
      try {
        storage.removeItem(storageV3ImportUndoKey);
      } catch {
        // The receipt is invalid once the committed head changes, even if cleanup is denied.
      }
      return portableSuccess(candidateRaw, result, nowMs, false);
    });
  } catch (error) {
    return coordinationFailure(error);
  }
}

export async function reconcilePagehideSnapshots(storage: Storage, nowMs = Date.now()): Promise<StorageWriteResult | null> {
  const entries: Array<{ key: string; capturedAt: string; baseSaveId: string | null; candidate: DecodedEnvelope }> = [];
  const deferredKeys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(storageV3PagehidePrefix)) deferredKeys.push(key);
    }
  } catch {
    return writeFailure("read-denied", "preflight");
  }
  for (const key of deferredKeys) {
    let decoded: ReturnType<typeof decodePagehideSnapshot>;
    try {
      decoded = decodePagehideSnapshot(storage.getItem(key), nowMs);
    } catch {
      return writeFailure("read-denied", "preflight");
    }
    if (!decoded) {
      try {
        storage.removeItem(key);
      } catch {
        // A malformed deferred record is never adopted; a later boot can retry cleanup.
      }
      continue;
    }
    entries.push({ key, capturedAt: decoded.snapshot.capturedAt, baseSaveId: decoded.snapshot.baseSaveId, candidate: decoded.candidate });
  }
  entries.sort((left, right) => right.capturedAt.localeCompare(left.capturedAt) || left.key.localeCompare(right.key));
  for (const entry of entries) {
    const current = readStoredGame(storage, nowMs);
    if (!current.writable) return null;
    if (current.committedSaveId !== entry.baseSaveId) {
      try {
        storage.removeItem(entry.key);
      } catch {
        // The stale record cannot overwrite the canonical head and can be retried later.
      }
      continue;
    }
    if (entry.candidate.attempt.status !== "valid" || entry.candidate.progress.status !== "valid") continue;
    const result = await writeStoredGame(storage, entry.candidate.attempt.value, entry.candidate.progress.value, nowMs, {
      expectedSaveId: entry.baseSaveId,
      saveId: entry.candidate.saveId,
    });
    if (result.ok || result.code === "concurrent-write") {
      if (result.ok) advanceImportUndo(storage, entry.baseSaveId, result.saveId, nowMs);
      try {
        storage.removeItem(entry.key);
      } catch {
        // A committed record is harmless: its base revision no longer matches on the next boot.
      }
    }
    return result;
  }
  return null;
}

export function shouldRestoreAttempt(state: PersistedRunState, canonicalPuzzleId: string) {
  return state.completedAt === null || state.run.puzzleId === canonicalPuzzleId;
}

export function prepareStoredAttempt(state: PersistedRunState, nowMs = Date.now()) {
  return resumeStoredAttempt({ ...state, lastTickAt: null }, nowMs);
}
