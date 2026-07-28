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
import { decodeProgressSnapshot, readLegacyProgress } from "@/lib/progress";
import { normalizePuzzleOptions } from "@/lib/puzzle-options";
import {
  finalizeAttempt,
  resumeStoredAttempt,
  runStateSchemaVersion,
  snapshotAttempt,
} from "@/lib/run-state";

export const gameStorageKey = "astra-lexa:v2";
export const legacySessionStorageKey = "astra-lexa-session";

export type StoredGameResult = {
  game: PersistedGame | null;
  source: "v2" | "legacy" | "none";
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
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

  const normalized = normalizePuzzleOptions(value as Partial<PuzzleOptions>, nowMs);
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
    && value.clueDensity === normalized.clueDensity
    && value.timerEnabled === normalized.timerEnabled
    && value.learningMode === normalized.learningMode
    && value.seed === normalized.seed;

  return exact ? normalized : null;
}

function isPuzzleWord(value: unknown): value is PuzzleWord {
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
    || value.words.length === 0
    || !value.words.every(isPuzzleWord)) {
    return null;
  }

  const options = decodeOptions(value.options, nowMs, allowLegacyDefaults);
  const wordIds = new Set(value.words.map((word) => word.id));
  const board = decodeBoard(value.board, wordIds);
  if (!options || !board || board.placements.length !== value.words.length) {
    return null;
  }

  return {
    ...(value as unknown as PuzzleRun),
    id: value.id,
    puzzleId: typeof value.puzzleId === "string" && value.puzzleId ? value.puzzleId : value.id,
    generatorVersion: typeof value.generatorVersion === "number" && Number.isInteger(value.generatorVersion)
      ? value.generatorVersion
      : 1,
    options,
    board,
    words: value.words,
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

export function decodePersistedGame(raw: string, nowMs = Date.now()): PersistedGame | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!isObject(value) || value.schemaVersion !== 2) {
      return null;
    }

    const progress = decodeProgressSnapshot(value.progress);
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

export function readStoredGame(storage: Pick<Storage, "getItem">, nowMs = Date.now()): StoredGameResult {
  try {
    const currentRaw = storage.getItem(gameStorageKey);
    if (currentRaw) {
      const game = decodePersistedGame(currentRaw, nowMs);
      if (game) {
        return { game, source: "v2" };
      }
    }

    const progress = readLegacyProgress(storage);
    const legacy = migrateLegacyGame(storage.getItem(legacySessionStorageKey), progress, nowMs);
    return legacy ? { game: legacy, source: "legacy" } : { game: null, source: "none" };
  } catch {
    return { game: null, source: "none" };
  }
}

export function serializeStoredGame(state: PersistedRunState, progress: ProgressSnapshot, nowMs = Date.now()) {
  const game: PersistedGame = {
    schemaVersion: 2,
    currentAttempt: snapshotAttempt(state, nowMs),
    progress,
  };
  return JSON.stringify(game);
}

export function writeStoredGame(
  storage: Pick<Storage, "setItem">,
  state: PersistedRunState,
  progress: ProgressSnapshot,
  nowMs = Date.now(),
) {
  try {
    storage.setItem(gameStorageKey, serializeStoredGame(state, progress, nowMs));
    return true;
  } catch {
    return false;
  }
}

export function shouldRestoreAttempt(state: PersistedRunState, canonicalPuzzleId: string) {
  return state.completedAt === null || state.run.puzzleId === canonicalPuzzleId;
}

export function prepareStoredAttempt(state: PersistedRunState, nowMs = Date.now()) {
  return resumeStoredAttempt({ ...state, lastTickAt: null }, nowMs);
}
