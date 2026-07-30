import type { AssistLedger, AssistSummary, CurrentRunState, PersistedRunState, PreparedRunState, PuzzleRun } from "@/lib/game-types";
import { getRunTargetCells } from "@/lib/puzzle-board";

export const runStateSchemaVersion = 2 as const;

export function createEmptyAssistLedger(): AssistLedger {
  return {
    hintStepsByWord: {},
    revealedCellKeys: [],
    anagramWordIds: [],
    revealedWordIds: [],
    puzzleRevealed: false,
  };
}

export function createAttemptId(nowMs = Date.now(), randomId?: string) {
  const generated = randomId ?? globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `attempt-${nowMs.toString(36)}-${generated}`;
}

export function createPreparedRunState(run: PuzzleRun): PreparedRunState {
  return {
    attemptId: null,
    startedAt: null,
    completedAt: null,
    run,
    guesses: {},
    cellEntries: {},
    solvedIds: [],
    activeWordId: run.words[0]?.id ?? null,
    assists: createEmptyAssistLedger(),
    paused: false,
    elapsedMs: 0,
    lastTickAt: null,
  };
}

export function isStartedAttempt(state: CurrentRunState): state is PersistedRunState {
  return state.attemptId !== null && state.startedAt !== null;
}

export function startPreparedAttempt(
  state: CurrentRunState,
  nowMs = Date.now(),
  attemptId = createAttemptId(nowMs),
): PersistedRunState {
  if (isStartedAttempt(state)) {
    return state;
  }

  return {
    schemaVersion: runStateSchemaVersion,
    ...state,
    attemptId,
    startedAt: new Date(nowMs).toISOString(),
    lastTickAt: state.run.options.timerEnabled ? nowMs : null,
  };
}

export function canAcceptPlayIntent(state: CurrentRunState) {
  return !isStartedAttempt(state) || canMutateAttempt(state);
}

export function createAttemptFromRun(run: PuzzleRun, nowMs = Date.now(), attemptId = createAttemptId(nowMs)): PersistedRunState {
  const startedAt = new Date(nowMs).toISOString();

  return {
    schemaVersion: runStateSchemaVersion,
    attemptId,
    startedAt,
    completedAt: null,
    run,
    guesses: {},
    cellEntries: {},
    solvedIds: [],
    activeWordId: run.words[0]?.id ?? null,
    assists: createEmptyAssistLedger(),
    paused: false,
    elapsedMs: 0,
    lastTickAt: run.options.timerEnabled ? nowMs : null,
  };
}

export function isAttemptComplete(state: PersistedRunState) {
  return state.run.words.length > 0 && state.solvedIds.length === state.run.words.length;
}

export function canMutateAttempt(state: PersistedRunState) {
  return !state.paused && !state.completedAt && !isAttemptComplete(state);
}

export function getDisplayedElapsedMs(state: PersistedRunState, nowMs = Date.now(), visible = true) {
  if (
    !visible
    || !state.run.options.timerEnabled
    || state.paused
    || state.completedAt
    || state.lastTickAt === null
  ) {
    return state.elapsedMs;
  }

  return state.elapsedMs + Math.max(0, nowMs - state.lastTickAt);
}

export function settleAttemptClock(state: PersistedRunState, nowMs = Date.now()) {
  if (!state.run.options.timerEnabled || state.lastTickAt === null) {
    return state.lastTickAt === null ? state : { ...state, lastTickAt: null };
  }

  return {
    ...state,
    elapsedMs: state.elapsedMs + Math.max(0, nowMs - state.lastTickAt),
    lastTickAt: null,
  };
}

export function setAttemptPaused(state: PersistedRunState, paused: boolean, nowMs = Date.now()) {
  if (state.completedAt || isAttemptComplete(state) || state.paused === paused) {
    return state;
  }

  if (paused) {
    return {
      ...settleAttemptClock(state, nowMs),
      paused: true,
    };
  }

  return {
    ...state,
    paused: false,
    lastTickAt: state.run.options.timerEnabled ? nowMs : null,
  };
}

export function setAttemptVisibility(state: PersistedRunState, visible: boolean, nowMs = Date.now()) {
  if (!visible) {
    return settleAttemptClock(state, nowMs);
  }

  if (state.paused || state.completedAt || isAttemptComplete(state) || !state.run.options.timerEnabled || state.lastTickAt !== null) {
    return state;
  }

  return {
    ...state,
    lastTickAt: nowMs,
  };
}

export function finalizeAttempt(state: PersistedRunState, nowMs = Date.now()) {
  if (!isAttemptComplete(state) || state.completedAt) {
    return state;
  }

  return {
    ...settleAttemptClock(state, nowMs),
    completedAt: new Date(nowMs).toISOString(),
    paused: false,
  };
}

export function snapshotAttempt(state: PersistedRunState, nowMs = Date.now()) {
  return settleAttemptClock(state, nowMs);
}

export function resumeStoredAttempt(state: PersistedRunState, nowMs = Date.now()) {
  if (state.paused || state.completedAt || isAttemptComplete(state) || !state.run.options.timerEnabled) {
    return {
      ...state,
      lastTickAt: null,
    };
  }

  return {
    ...state,
    lastTickAt: nowMs,
  };
}

function appendUnique(values: string[], value: string) {
  return values.includes(value) ? values : [...values, value];
}

export function recordHintStep(state: PersistedRunState, wordId: string) {
  if (!canMutateAttempt(state) || !state.run.words.some((word) => word.id === wordId)) {
    return state;
  }

  const currentLevel = state.assists.hintStepsByWord[wordId] ?? 0;
  if (currentLevel >= 3) {
    return state;
  }

  return {
    ...state,
    assists: {
      ...state.assists,
      hintStepsByWord: {
        ...state.assists.hintStepsByWord,
        [wordId]: currentLevel + 1,
      },
    },
  };
}

export function recordRevealedCell(state: PersistedRunState, cellKey: string) {
  if (!canMutateAttempt(state) || !getRunTargetCells(state.run).some((cell) => `${cell.row}:${cell.col}` === cellKey)) {
    return state;
  }

  return {
    ...state,
    assists: {
      ...state.assists,
      revealedCellKeys: appendUnique(state.assists.revealedCellKeys, cellKey),
    },
  };
}

export function recordAnagram(state: PersistedRunState, wordId: string) {
  if (!canMutateAttempt(state) || !state.run.words.some((word) => word.id === wordId)) {
    return state;
  }

  return {
    ...state,
    assists: {
      ...state.assists,
      anagramWordIds: appendUnique(state.assists.anagramWordIds, wordId),
    },
  };
}

export function recordWordReveal(state: PersistedRunState, wordId: string) {
  if (!canMutateAttempt(state) || !state.run.words.some((word) => word.id === wordId)) {
    return state;
  }

  return {
    ...state,
    assists: {
      ...state.assists,
      revealedWordIds: appendUnique(state.assists.revealedWordIds, wordId),
    },
  };
}

export function recordPuzzleReveal(state: PersistedRunState) {
  if (!canMutateAttempt(state) || state.assists.puzzleRevealed) {
    return state;
  }

  return {
    ...state,
    assists: {
      ...state.assists,
      puzzleRevealed: true,
    },
  };
}

export function summarizeAssists(state: PersistedRunState): AssistSummary {
  const hintSteps = Object.values(state.assists.hintStepsByWord).reduce((total, level) => total + level, 0);
  const revealedLetters = state.assists.revealedCellKeys.length;
  const anagrams = state.assists.anagramWordIds.length;
  const revealedWords = state.assists.revealedWordIds.length;
  const puzzleRevealed = state.assists.puzzleRevealed;
  return {
    total: hintSteps + revealedLetters + anagrams + revealedWords + (puzzleRevealed ? 1 : 0),
    hintSteps,
    revealedLetters,
    anagrams,
    revealedWords,
    puzzleRevealed,
  };
}

export type WordAssistAttribution = {
  wordId: string;
  hintSteps: number;
  revealedLetters: number;
  anagramUsed: boolean;
  wordRevealed: boolean;
  puzzleRevealed: boolean;
};

export function buildAssistRecap(state: PersistedRunState) {
  const revealedCells = new Set(state.assists.revealedCellKeys);
  const anagramWords = new Set(state.assists.anagramWordIds);
  const revealedWords = new Set(state.assists.revealedWordIds);
  const targetCells = getRunTargetCells(state.run);
  const words: WordAssistAttribution[] = state.run.words.map((word) => {
    const revealedLetters = targetCells.filter((cell) => revealedCells.has(`${cell.row}:${cell.col}`) && cell.wordIds.includes(word.id)).length;
    return {
      wordId: word.id,
      hintSteps: state.assists.hintStepsByWord[word.id] ?? 0,
      revealedLetters,
      anagramUsed: anagramWords.has(word.id),
      wordRevealed: revealedWords.has(word.id),
      puzzleRevealed: state.assists.puzzleRevealed,
    };
  });
  const affectedWords = words.filter((word) => word.hintSteps > 0 || word.revealedLetters > 0 || word.anagramUsed || word.wordRevealed || word.puzzleRevealed);
  return {
    global: summarizeAssists(state),
    words,
    affectedWords,
    affectedWordCount: affectedWords.length,
    unaffectedWordCount: words.length - affectedWords.length,
  };
}

export function getAssistCount(state: PersistedRunState) {
  return summarizeAssists(state).total;
}
