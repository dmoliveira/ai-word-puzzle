"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistSummary, CurrentRunState, PersistedRunState, ProgressSnapshot, PuzzleBoardCell, PuzzlePlacement, PuzzleOptions, PuzzleRun, PuzzleWord, RunSummary, TopicId } from "@/lib/game-types";
import { buildPuzzleRun, createHintLadder, PuzzleGenerationError, sanitizeGuess } from "@/lib/puzzle-generator";
import { getQuestV3FillLetter, hasVerifiedPuzzleProvenance } from "@/lib/puzzle-provenance";
import { isCrosswordContentPack, isCrosswordTopic } from "@/lib/clue-catalog";
import { getCanonicalDailyOptions, getPuzzleSizeRange, getUtcDay, isCanonicalDailyOptions, normalizePuzzleOptions, parseSharedOptions, type SharedPuzzleProvenance } from "@/lib/puzzle-options";
import { buildDailyArchive, createEmptyProgress, recordRunProgress } from "@/lib/progress";
import {
  canMutateAttempt,
  canAcceptPlayIntent,
  createPreparedRunState,
  finalizeAttempt,
  getDisplayedElapsedMs,
  isStartedAttempt,
  recordAnagram,
  recordHintStep,
  recordPuzzleReveal,
  recordRevealedCell,
  recordWordReveal,
  setAttemptPaused,
  setAttemptVisibility,
  startPreparedAttempt,
  summarizeAssists,
} from "@/lib/run-state";
import {
  createPortableBackup,
  hasPortableImportUndo,
  importPortableBackup,
  maxPortableBackupBytes,
  prepareStoredAttempt,
  previewPortableBackup,
  readStoredGame,
  reconcilePagehideSnapshots,
  stagePagehideSnapshot,
  undoPortableImport,
  writeStoredGame,
  type PortableBackupCandidate,
  type PortableBackupPreview,
  type StoredGameResult,
  type StorageWriteResult,
} from "@/lib/session-storage";
import {
  applyCellEntry,
  applyWordEntry,
  clearWordEntries,
  deriveGuessFromCells,
  type EntryTransaction,
} from "@/lib/studio/attempt-entries";
import { refreshPreparedDaily, resolveStudioBootstrap, type BootstrapSource } from "@/lib/studio/bootstrap";
import { needsRunReplacementConfirmation, replaceRunTransaction } from "@/lib/studio/run-replacement";
import { canReplaySummaryExactly, resolveSavedRunReplay } from "@/lib/studio/replay";
import { getThemeStyle, themeStyles } from "@/lib/themes";
import { contentCatalog, topicCatalog, wordBank } from "@/lib/word-bank";

type ToastState = {
  tone: "success" | "muted";
  message: string;
} | null;

type ToastTone = NonNullable<ToastState>["tone"];
type HistoryFilterMode = "all" | "daily" | "custom";
type HistoryFilterStatus = "all" | "finished" | "active";
type ReviewTarget =
  | { kind: "none" }
  | { kind: "word"; attemptId: string; wordId: string }
  | { kind: "puzzle"; attemptId: string };
type BuilderPresetId = "gentle" | "balanced" | "study" | "deep";
type MobilePanel = "board" | "clues" | "review" | "archive";
type WordSelectionIntent = "answer" | "cell";
type QuestPathState = {
  anchor: string | null;
  cells: string[];
};
type PendingRunReplacement = {
  options: PuzzleOptions;
  expectedProvenance: SharedPuzzleProvenance | null;
  intent: "options" | "today-daily" | "random-custom";
};
type StorageStatus = {
  tone: "warning" | "recovered";
  message: string;
} | null;

const bootstrapOptions: PuzzleOptions = {
  mode: "custom",
  challenge: "quest",
  puzzleFamily: "classic",
  topics: ["myth", "cosmos", "greek"],
  contentPackId: "auto",
  puzzleSize: 7,
  boardView: "crossword",
  style: "alpha",
  timerEnabled: true,
  learningMode: false,
  seed: "bootstrap-shell",
};
const normalizeOptions = normalizePuzzleOptions;

function getStorageReadStatus(stored: StoredGameResult): StorageStatus {
  if (stored.issues.includes("future-version")) {
    return { tone: "warning", message: "This local save was created by a newer Astra Lexa version. Nothing was overwritten." };
  }
  if (stored.issues.includes("read-denied")) {
    return { tone: "warning", message: "Local storage is blocked. Changes in this tab are not saved." };
  }
  if (stored.issues.includes("recovery-required")) {
    return { tone: "warning", message: "Local saves could not be verified. Older v2 data was not used because storage v3 was already present." };
  }
  if (stored.issues.includes("recovered-mixed")) {
    return { tone: "recovered", message: "Valid attempt and progress data were recovered from the two newest local saves." };
  }
  if (stored.issues.includes("recovered-previous")) {
    return { tone: "recovered", message: "The newest local save could not be opened, so the previous verified save was restored." };
  }
  if (stored.issues.includes("recovered-pending")) {
    return { tone: "recovered", message: "A verified interrupted save was restored read-only. This tab will not overwrite local data." };
  }
  if (stored.issues.includes("interrupted-adoption")) {
    return { tone: "recovered", message: "An interrupted save was ignored and your earlier local data was restored." };
  }
  if (stored.issues.includes("progress-reset") || stored.issues.includes("attempt-unavailable")) {
    return { tone: "recovered", message: "Part of the local save was unavailable; valid data was kept and the damaged section was reset." };
  }
  return null;
}

function getStorageFailureMessage(result: Exclude<StorageWriteResult, { ok: true }>) {
  switch (result.code) {
    case "quota-exceeded":
      return "Changes are not saved—local storage is full. Keep this tab open, free site storage, then retry.";
    case "future-version":
      return "This local save belongs to a newer Astra Lexa version. Nothing was overwritten.";
    case "concurrent-write":
      return "Another tab changed this local save. Reload before replacing or importing a puzzle.";
    case "lock-timeout":
      return "Another tab is still saving. These changes are not saved yet; retry shortly.";
    case "coordination-unavailable":
      return "This browser could not coordinate local saves across tabs. These changes are not saved.";
    case "commit-uncertain":
    case "verification-failed":
    case "readback-mismatch":
      return "The local save could not be verified. Reload before replacing or importing a puzzle.";
    case "recovery-required":
      return "Local saves require recovery. Older v2 data was not used and nothing was overwritten.";
    case "candidate-too-large":
      return "Changes are not saved because this local puzzle record is too large.";
    case "candidate-invalid":
      return "Changes are not saved because the local puzzle record failed validation.";
    default:
      return "Changes are not saved because this browser blocked local storage.";
  }
}

function createRuntimeSeed(nowMs: number) {
  return `custom-${nowMs}`;
}

function readNow() {
  return Date.now();
}

function buildShareUrl(run: PuzzleRun) {
  const { options } = run;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const shareSeed = options.mode === "daily" ? options.seed.replace(/^daily:/, "") : options.seed;
  url.searchParams.set("generatorVersion", String(run.generatorVersion));
  if (run.corpusRevision && run.fingerprintVersion && run.puzzleFingerprint) {
    url.searchParams.set("corpusRevision", run.corpusRevision);
    url.searchParams.set("fingerprintVersion", String(run.fingerprintVersion));
    url.searchParams.set("puzzleFingerprint", run.puzzleFingerprint);
  }
  url.searchParams.set("mode", options.mode);
  url.searchParams.set("seed", shareSeed);
  url.searchParams.set("challenge", options.challenge);
  url.searchParams.set("puzzleFamily", options.puzzleFamily);
  url.searchParams.set("contentPackId", options.contentPackId);
  url.searchParams.set("boardView", options.boardView);
  url.searchParams.set("style", options.style);
  url.searchParams.set("puzzleSize", String(options.puzzleSize));
  url.searchParams.set("timerEnabled", String(options.timerEnabled));
  url.searchParams.set("learningMode", String(options.learningMode));
  url.searchParams.set("topics", options.topics.join(","));
  return url.toString();
}

function getExpectedRunProvenance(run: PuzzleRun): SharedPuzzleProvenance | null {
  return hasVerifiedPuzzleProvenance(run) && run.generatorVersion === 3 && run.corpusRevision && run.fingerprintVersion === 1 && run.puzzleFingerprint
    ? { generatorVersion: 3, corpusRevision: run.corpusRevision, fingerprintVersion: 1, puzzleFingerprint: run.puzzleFingerprint }
    : null;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatAssistBreakdown(assists: AssistSummary) {
  if (assists.total === 0) {
    return "No assists";
  }

  const parts = [
    assists.hintSteps > 0 ? `${assists.hintSteps} hint ${assists.hintSteps === 1 ? "step" : "steps"}` : null,
    assists.revealedLetters > 0 ? `${assists.revealedLetters} ${assists.revealedLetters === 1 ? "letter" : "letters"}` : null,
    assists.anagrams > 0 ? `${assists.anagrams} ${assists.anagrams === 1 ? "anagram" : "anagrams"}` : null,
    assists.revealedWords > 0 ? `${assists.revealedWords} ${assists.revealedWords === 1 ? "word" : "words"} revealed` : null,
    assists.puzzleRevealed ? "full puzzle revealed" : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getWordPlacement(state: CurrentRunState, wordId: string) {
  return state.run.board.placements.find((placement) => placement.wordId === wordId) ?? null;
}

function getWordById(state: CurrentRunState, wordId: string) {
  return state.run.words.find((word) => word.id === wordId) ?? null;
}

function getPlacementByWordId(state: CurrentRunState, wordId: string) {
  return state.run.board.placements.find((placement) => placement.wordId === wordId) ?? null;
}

function getWordCells(state: CurrentRunState, placement: PuzzlePlacement) {
  const word = getWordById(state, placement.wordId);
  if (!word) {
    return [] as PuzzleBoardCell[];
  }

  return Array.from({ length: word.answer.length }, (_, index) => {
    const row = placement.row + (placement.direction === "down" ? index : 0);
    const col = placement.col + (placement.direction === "across" ? index : 0);
    return state.run.board.cells.find((cell) => cell.row === row && cell.col === col);
  }).filter((cell): cell is PuzzleBoardCell => Boolean(cell));
}

function getCrosswordCellLabel(state: CurrentRunState, cell: PuzzleBoardCell, activeWordId: string | null) {
  const clueReferences = cell.wordIds
    .map((wordId) => getPlacementByWordId(state, wordId))
    .filter((placement): placement is PuzzlePlacement => Boolean(placement))
    .map((placement) => `${placement.clueNumber} ${placement.direction}`);
  const entry = state.cellEntries[getCellKey(cell.row, cell.col)];
  const activePlacement = activeWordId ? getPlacementByWordId(state, activeWordId) : null;
  const selected = Boolean(activeWordId && cell.wordIds.includes(activeWordId));
  const solved = cell.wordIds.every((wordId) => state.solvedIds.includes(wordId));
  const parts = [
    `Row ${cell.row + 1} column ${cell.col + 1}`,
    clueReferences.length > 0 ? clueReferences.join(" and ") : "playable cell",
    entry ? `letter ${entry.toUpperCase()}` : "blank",
    selected && activePlacement ? `${activePlacement.clueNumber} ${activePlacement.direction} selected` : null,
    solved ? "solved" : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(", ");
}

function getQuestCellLabel(row: number, col: number, letter: string, selected: boolean, anchor: boolean) {
  return [
    `Row ${row + 1} column ${col + 1}`,
    `letter ${letter.toUpperCase()}`,
    anchor ? "start selected" : selected ? "selected path" : null,
  ].filter((part): part is string => Boolean(part)).join(", ");
}

function getHintLevel(wordId: string, hintLevels: Record<string, number>) {
  return hintLevels[wordId] ?? 0;
}

function getNextWordId(state: CurrentRunState, currentWordId: string | null, step: 1 | -1, preferUnsolved = true) {
  const placements = preferUnsolved
    ? state.run.board.placements.filter((placement) => !state.solvedIds.includes(placement.wordId))
    : state.run.board.placements;

  if (placements.length === 0) {
    return currentWordId;
  }

  const currentIndex = placements.findIndex((placement) => placement.wordId === currentWordId);
  const baseIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = (baseIndex + step + placements.length) % placements.length;
  return placements[nextIndex]?.wordId ?? currentWordId;
}

function countFilledLetters(value: string) {
  return value.replace(/[^a-z]/g, "").length;
}

function getFirstOpenCellKey(state: CurrentRunState, wordId: string | null) {
  if (!wordId) {
    return null;
  }

  const placement = getPlacementByWordId(state, wordId);
  if (!placement) {
    return null;
  }

  const cells = getWordCells(state, placement);
  const firstOpen = cells.find((cell) => !(state.cellEntries[getCellKey(cell.row, cell.col)] ?? ""));
  const target = firstOpen ?? cells[0];
  return target ? getCellKey(target.row, target.col) : null;
}

function findNeighborCell(state: CurrentRunState, row: number, col: number, rowStep: number, colStep: number) {
  let nextRow = row + rowStep;
  let nextCol = col + colStep;

  while (nextRow >= 0 && nextCol >= 0 && nextRow < state.run.board.size && nextCol < state.run.board.size) {
    const cell = state.run.board.cells.find((entry) => entry.row === nextRow && entry.col === nextCol);
    if (cell) {
      return cell;
    }

    nextRow += rowStep;
    nextCol += colStep;
  }

  return null;
}

function getPreferredWordIdForCell(state: CurrentRunState, cell: PuzzleBoardCell, preferredWordId: string | null) {
  if (preferredWordId && cell.wordIds.includes(preferredWordId)) {
    return preferredWordId;
  }

  return cell.wordIds.find((wordId) => !state.solvedIds.includes(wordId)) ?? cell.wordIds[0] ?? null;
}

function getThemeAccentCellClass(style: PuzzleOptions["style"]) {
  switch (style) {
    case "nebula":
      return "from-fuchsia-500/20 to-violet-500/20";
    case "sunforge":
      return "from-amber-500/20 to-orange-500/20";
    case "arcade":
      return "from-emerald-500/20 to-cyan-500/20";
    default:
      return "from-sky-500/20 to-cyan-500/20";
  }
}

function getClueArtTone(topicId: TopicId, frequencyBand: PuzzleWord["frequencyBand"]) {
  const baseTone =
    topicId === "myth" ? "from-amber-500/18 via-orange-500/10 to-transparent" :
    topicId === "cosmos" ? "from-sky-500/18 via-violet-500/10 to-transparent" :
    topicId === "ocean" ? "from-cyan-500/18 via-blue-500/10 to-transparent" :
    topicId === "garden" ? "from-emerald-500/18 via-lime-500/10 to-transparent" :
    topicId === "city" ? "from-fuchsia-500/18 via-slate-500/10 to-transparent" :
    topicId === "music" ? "from-pink-500/18 via-violet-500/10 to-transparent" :
    topicId === "kitchen" ? "from-orange-500/18 via-amber-500/10 to-transparent" :
    topicId === "wild" ? "from-lime-500/18 via-emerald-500/10 to-transparent" :
    topicId === "weather" ? "from-sky-500/18 via-slate-400/10 to-transparent" :
    topicId === "invent" ? "from-cyan-500/18 via-slate-500/10 to-transparent" :
    topicId === "story" ? "from-amber-500/18 via-rose-500/10 to-transparent" :
    "from-violet-500/18 via-sky-500/10 to-transparent";

  const rarityTone =
    frequencyBand === "rare" ? "border-fuchsia-400/25" :
    frequencyBand === "uncommon" ? "border-sky-400/20" :
    "border-white/10";

  return { baseTone, rarityTone };
}

function getClueArtLabel(index: number) {
  return ["topic", "starter", "length"][index] ?? "cue";
}

function getQuestDisplayLetter(cell: PuzzleBoardCell | undefined, seed: string, row: number, col: number) {
  return (cell ? cell.solution : getQuestV3FillLetter(seed, row, col)).toUpperCase();
}

function buildLinearQuestPath(start: { row: number; col: number }, end: { row: number; col: number }) {
  const rowDelta = end.row - start.row;
  const colDelta = end.col - start.col;
  const rowStep = rowDelta === 0 ? 0 : rowDelta / Math.abs(rowDelta);
  const colStep = colDelta === 0 ? 0 : colDelta / Math.abs(colDelta);

  const straight = rowDelta === 0 || colDelta === 0 || Math.abs(rowDelta) === Math.abs(colDelta);
  if (!straight) {
    return null;
  }

  const length = Math.max(Math.abs(rowDelta), Math.abs(colDelta)) + 1;
  return Array.from({ length }, (_, index) => ({
    row: start.row + rowStep * index,
    col: start.col + colStep * index,
  }));
}

function getFrequencyLabel(frequencyBand: PuzzleWord["frequencyBand"]) {
  switch (frequencyBand) {
    case "common":
      return "familiar";
    case "uncommon":
      return "stretch";
    case "rare":
      return "advanced";
  }
}

function getActiveClueSummary(word: PuzzleWord, challenge: PuzzleOptions["challenge"]) {
  if (challenge === "breeze") {
    return `${word.topicLabel} · ${word.length} letters · starts with ${word.answer[0]?.toUpperCase() ?? "?"}`;
  }
  if (challenge === "quest") {
    return `${word.topicLabel} · ${word.length} letters`;
  }
  return `${word.topicLabel} · clue only`;
}

function getClueCardValue(word: PuzzleWord, index: number, challenge: PuzzleOptions["challenge"]) {
  if (index === 0) {
    return word.topicLabel;
  }

  if (index === 1) {
    return getFrequencyLabel(word.frequencyBand);
  }

  return challenge === "breeze" ? `${word.length} letters` : challenge === "quest" ? "Length in clue header" : "No free letter hint";
}

function buildAnagram(answer: string) {
  const chars = answer.toUpperCase().split("");
  if (chars.length < 2) {
    return null;
  }

  for (let offset = 1; offset < chars.length; offset += 1) {
    const rotated = [...chars.slice(offset), ...chars.slice(0, offset)].join("");
    if (rotated !== answer.toUpperCase()) {
      return rotated;
    }
  }

  const reversed = [...chars].reverse().join("");
  return reversed === answer.toUpperCase() ? null : reversed;
}

function isWordReviewAuthorized(state: CurrentRunState, target: Extract<ReviewTarget, { kind: "word" }>) {
  return isStartedAttempt(state)
    && target.attemptId === state.attemptId
    && state.run.words.some((word) => word.id === target.wordId)
    && (state.solvedIds.includes(target.wordId)
      || state.assists.revealedWordIds.includes(target.wordId)
      || state.assists.puzzleRevealed);
}

function isPuzzleReviewAuthorized(state: CurrentRunState, target: Extract<ReviewTarget, { kind: "puzzle" }>) {
  return isStartedAttempt(state) && target.attemptId === state.attemptId && (state.completedAt !== null || state.assists.puzzleRevealed);
}

export function WordPuzzleStudio() {
  const activeAnswerInputRef = useRef<HTMLInputElement | null>(null);
  const boardCellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const revealDialogRef = useRef<HTMLDialogElement | null>(null);
  const revealCancelRef = useRef<HTMLButtonElement | null>(null);
  const revealInvokerRef = useRef<HTMLElement | null>(null);
  const replacementDialogRef = useRef<HTMLDialogElement | null>(null);
  const replacementCancelRef = useRef<HTMLButtonElement | null>(null);
  const replacementInvokerRef = useRef<HTMLElement | null>(null);
  const replacementFocusRestoreRef = useRef<HTMLElement | null>(null);
  const replacementRequestRef = useRef<PendingRunReplacement | null>(null);
  const replacementLockRef = useRef(false);
  const replacementCommitInFlightRef = useRef(false);
  const importDialogRef = useRef<HTMLDialogElement | null>(null);
  const importCancelRef = useRef<HTMLButtonElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const importInvokerRef = useRef<HTMLElement | null>(null);
  const importFocusRestoreRef = useRef<HTMLElement | null>(null);
  const importCandidateRef = useRef<PortableBackupCandidate | null>(null);
  const importCommitInFlightRef = useRef(false);
  const reviewOriginRef = useRef<{ element: HTMLElement | null; panel: MobilePanel }>({ element: null, panel: "board" });
  const reviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const runHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const completionTransitionRef = useRef({ hydrated: false, finished: false });
  const workspaceTabRefs = useRef<Record<MobilePanel, HTMLButtonElement | null>>({ board: null, clues: null, review: null, archive: null });
  const questPointerStartRef = useRef<string | null>(null);
  const questPointerMovedRef = useRef(false);
  const questPointerPreviousPathRef = useRef<QuestPathState>({ anchor: null, cells: [] });
  const suppressQuestClickRef = useRef(false);
  const [options, setOptions] = useState<PuzzleOptions>(bootstrapOptions);
  const [state, setState] = useState<CurrentRunState>(() => createPreparedRunState(buildPuzzleRun(bootstrapOptions)));
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget>({ kind: "none" });
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("board");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [builderAdvancedOpen, setBuilderAdvancedOpen] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState<ReviewTarget>({ kind: "none" });
  const [pendingReplacement, setPendingReplacement] = useState<PendingRunReplacement | null>(null);
  const [pendingImportPreview, setPendingImportPreview] = useState<PortableBackupPreview | null>(null);
  const [shownAnagrams, setShownAnagrams] = useState<Record<string, string>>({});
  const [questPath, setQuestPath] = useState<QuestPathState>({ anchor: null, cells: [] });
  const [isStarting, setIsStarting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [portableUndoAvailable, setPortableUndoAvailable] = useState(false);
  const [portableMessage, setPortableMessage] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [historyModeFilter, setHistoryModeFilter] = useState<HistoryFilterMode>("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryFilterStatus>("all");
  const [progress, setProgress] = useState<ProgressSnapshot>(createEmptyProgress());
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [bootstrapSource, setBootstrapSource] = useState<BootstrapSource>("current-daily");
  const [compactWorkspace, setCompactWorkspace] = useState(false);
  const [announcement, setAnnouncement] = useState("Puzzle ready.");
  const [clockNow, setClockNow] = useState(readNow);
  const stateRef = useRef(state);
  const progressRef = useRef(progress);
  const skipBootstrapPersistenceRef = useRef(true);
  const skipNextPersistenceRef = useRef(false);
  const pendingPersistenceTimerRef = useRef<number | null>(null);
  const storageRevisionRef = useRef<string | null>(null);
  const storageWritableRef = useRef(true);
  const storageStatusRef = useRef<StorageStatus>(null);
  const storageWriterIdRef = useRef("");
  const portableUndoAvailableRef = useRef(false);
  const storageSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const updatePortableUndoAvailability = useCallback((available: boolean) => {
    portableUndoAvailableRef.current = available;
    setPortableUndoAvailable(available);
  }, []);
  const applyStorageWriteResult = useCallback((result: StorageWriteResult) => {
    if (result.ok) {
      storageRevisionRef.current = result.saveId;
      portableUndoAvailableRef.current = false;
      setPortableUndoAvailable(false);
      storageWritableRef.current = true;
      if (storageStatusRef.current?.tone === "warning") setAnnouncement("Progress is saved locally again.");
      storageStatusRef.current = null;
      setStorageStatus(null);
      return true;
    }

    const message = getStorageFailureMessage(result);
    if (["future-version", "concurrent-write", "commit-uncertain", "recovery-required"].includes(result.code)) {
      storageWritableRef.current = false;
    }
    const status = { tone: "warning", message } as const;
    storageStatusRef.current = status;
    setStorageStatus(status);
    setAnnouncement(message);
    return false;
  }, []);
  const queueStorageWrite = useCallback((nextState: PersistedRunState, nextProgress: ProgressSnapshot, nowMs: number) => {
    const operation = storageSaveQueueRef.current.then(async () => {
      if (!storageWritableRef.current) {
        return { ok: false, code: "recovery-required", stage: "preflight", preservation: "unchanged", retryable: false } as const;
      }
      const result = await writeStoredGame(window.localStorage, nextState, nextProgress, nowMs, {
        expectedSaveId: storageRevisionRef.current,
      });
      if (result.ok) storageRevisionRef.current = result.saveId;
      return result;
    });
    storageSaveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);
  const lexiconSize = wordBank.length;
  const theme = getThemeStyle(state.run.options.style);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const nowMs = readNow();
      storageWriterIdRef.current ||= globalThis.crypto?.randomUUID?.() ?? `${nowMs.toString(36)}-${Math.random().toString(36).slice(2)}`;
      const deferredResult = await reconcilePagehideSnapshots(window.localStorage, nowMs);
      if (cancelled) return;
      const stored = readStoredGame(window.localStorage, nowMs);
      const shared = parseSharedOptions(window.location.search, nowMs);
      const resolved = resolveStudioBootstrap({ stored, shared, nowMs, visible: !document.hidden });

      stateRef.current = resolved.current;
      progressRef.current = resolved.progress;
      storageRevisionRef.current = stored.committedSaveId;
      storageWritableRef.current = stored.writable;
      updatePortableUndoAvailability(hasPortableImportUndo(window.localStorage, stored.committedSaveId, nowMs));
      setOptions(resolved.builderOptions);
      setState(resolved.current);
      setProgress(resolved.progress);
      setBootstrapSource(resolved.source);
      setRunError(resolved.warning);
      const nextStorageStatus = getStorageReadStatus(stored) ?? (deferredResult && !deferredResult.ok
        ? { tone: "warning" as const, message: getStorageFailureMessage(deferredResult) }
        : null);
      storageStatusRef.current = nextStorageStatus;
      setStorageStatus(nextStorageStatus);
      setFocusedCellKey(getFirstOpenCellKey(resolved.current, resolved.current.activeWordId));
      setMobilePanel(resolved.current.run.options.boardView === "crossword" ? "clues" : "board");
      setClockNow(nowMs);
      setHydrated(true);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [updatePortableUndoAvailability]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (skipBootstrapPersistenceRef.current) {
      skipBootstrapPersistenceRef.current = false;
      return;
    }

    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false;
      return;
    }

    if (!isStartedAttempt(state) || !storageWritableRef.current) {
      return;
    }

    const handle = window.setTimeout(async () => {
      pendingPersistenceTimerRef.current = null;
      if (!isStartedAttempt(stateRef.current)) {
        return;
      }
      const nowMs = readNow();
      const current = stateRef.current;
      const nextProgress = recordRunProgress(progressRef.current, current, nowMs);
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      applyStorageWriteResult(await queueStorageWrite(current, nextProgress, nowMs));
    }, 120);
    pendingPersistenceTimerRef.current = handle;

    return () => {
      window.clearTimeout(handle);
      if (pendingPersistenceTimerRef.current === handle) {
        pendingPersistenceTimerRef.current = null;
      }
    };
  }, [applyStorageWriteResult, hydrated, queueStorageWrite, state]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const syncAttemptVisibility = (visible: boolean) => {
      const nowMs = readNow();
      if (isStartedAttempt(stateRef.current)) {
        const nextState = setAttemptVisibility(stateRef.current, visible, nowMs);
        stateRef.current = nextState;
        setState(nextState);
      }
      setClockNow(nowMs);
    };
    const handleVisibilityChange = () => syncAttemptVisibility(!document.hidden);
    const handlePageHide = () => {
      const nowMs = readNow();
      if (!isStartedAttempt(stateRef.current)) {
        return;
      }
      if (pendingPersistenceTimerRef.current !== null) {
        window.clearTimeout(pendingPersistenceTimerRef.current);
        pendingPersistenceTimerRef.current = null;
      }
      const current = setAttemptVisibility(stateRef.current, false, nowMs);
      const nextProgress = recordRunProgress(progressRef.current, current, nowMs);
      stateRef.current = current;
      progressRef.current = nextProgress;
      setState(current);
      setProgress(nextProgress);
      if (storageWritableRef.current) {
        const staged = stagePagehideSnapshot(window.localStorage, current, nextProgress, nowMs, {
          baseSaveId: storageRevisionRef.current,
          writerId: storageWriterIdRef.current,
        });
        if (!staged.ok) {
          const message = staged.code === "quota-exceeded"
            ? "Changes could not be staged before this page closed because local storage is full."
            : "Changes could not be staged before this page closed. Keep this tab open and retry.";
          const status = { tone: "warning", message } as const;
          storageStatusRef.current = status;
          setStorageStatus(status);
        }
      }
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        syncAttemptVisibility(!document.hidden);
        void reconcilePagehideSnapshots(window.localStorage, readNow()).then((result) => {
          if (result) {
            applyStorageWriteResult(result);
            if (result.ok) updatePortableUndoAvailability(hasPortableImportUndo(window.localStorage, result.saveId));
          }
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [applyStorageWriteResult, hydrated, updatePortableUndoAvailability]);

  useEffect(() => {
    if (!hydrated || !isStartedAttempt(state) || state.paused || state.completedAt || !state.run.options.timerEnabled) {
      return;
    }

    const interval = window.setInterval(() => {
      setClockNow(readNow());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [hydrated, state, state.run.options.timerEnabled]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const refreshDaily = () => {
      const nowMs = readNow();
      setClockNow(nowMs);
      const nextState = refreshPreparedDaily(stateRef.current, bootstrapSource, nowMs);
      if (nextState === stateRef.current) {
        return;
      }

      commitState(nextState);
      setOptions(nextState.run.options);
      setFocusedCellKey(getFirstOpenCellKey(nextState, nextState.activeWordId));
      setMobilePanel(nextState.run.options.boardView === "crossword" ? "clues" : "board");
      setReviewTarget({ kind: "none" });
      setRevealConfirm({ kind: "none" });
      setAnnouncement("A new UTC daily puzzle is ready.");
    };
    const handleVisibility = () => {
      if (!document.hidden) refreshDaily();
    };
    const interval = window.setInterval(refreshDaily, 30_000);
    document.addEventListener("visibilitychange", handleVisibility);
    refreshDaily();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [bootstrapSource, hydrated]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const updateCompactWorkspace = () => setCompactWorkspace(query.matches);
    updateCompactWorkspace();
    query.addEventListener("change", updateCompactWorkspace);
    return () => query.removeEventListener("change", updateCompactWorkspace);
  }, []);

  useEffect(() => {
    const dialog = revealDialogRef.current;
    if (!dialog) {
      return;
    }

    if (revealConfirm.kind !== "none" && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => revealCancelRef.current?.focus());
    } else if (revealConfirm.kind === "none" && dialog.open) {
      dialog.close();
    }
  }, [revealConfirm]);

  useEffect(() => {
    const dialog = replacementDialogRef.current;
    if (!dialog) {
      return;
    }

    if (pendingReplacement && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => replacementCancelRef.current?.focus());
    } else if (!pendingReplacement && dialog.open) {
      dialog.close();
    }
  }, [pendingReplacement]);

  useEffect(() => {
    if (pendingReplacement || isStarting || !replacementFocusRestoreRef.current) return;
    const invoker = replacementFocusRestoreRef.current;
    replacementFocusRestoreRef.current = null;
    const handle = window.requestAnimationFrame(() => {
      if (invoker.isConnected && !invoker.matches(":disabled")) invoker.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [isStarting, pendingReplacement]);

  useEffect(() => {
    const dialog = importDialogRef.current;
    if (!dialog) return;
    if (pendingImportPreview && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => importCancelRef.current?.focus());
    } else if (!pendingImportPreview && dialog.open) {
      dialog.close();
    }
  }, [pendingImportPreview]);

  useEffect(() => {
    if (pendingImportPreview || isImporting || !importFocusRestoreRef.current) return;
    const invoker = importFocusRestoreRef.current;
    importFocusRestoreRef.current = null;
    const handle = window.requestAnimationFrame(() => {
      if (invoker.isConnected && !invoker.matches(":disabled")) invoker.focus();
    });
    return () => window.cancelAnimationFrame(handle);
  }, [isImporting, pendingImportPreview]);

  const solvedCount = state.solvedIds.length;
  const started = isStartedAttempt(state);
  const activeWord = state.run.words.find((word) => word.id === state.activeWordId) ?? state.run.words[0] ?? null;
  const activePlacement = activeWord ? getWordPlacement(state, activeWord.id) : null;
  const activeGuess = activeWord ? deriveGuessFromCells(state, activeWord.id) : "";
  const finished = Boolean(state.completedAt) || (solvedCount === state.run.words.length && state.run.words.length > 0);
  const activePlay = !finished;
  const progressLabel = `${solvedCount}/${state.run.words.length} solved`;
  const runStateLabel = finished ? "Done" : !started ? "Ready" : state.paused ? "Paused" : "Live";
  const cellMap = new Map(state.run.board.cells.map((cell) => [getCellKey(cell.row, cell.col), cell]));
  const archive = buildDailyArchive(progress, 10, clockNow);
  const activeFilledCount = countFilledLetters(activeGuess);
  const boardFocusKey = focusedCellKey ?? getFirstOpenCellKey(state, state.activeWordId);
  const assistSummary = started
    ? summarizeAssists(state)
    : { total: 0, hintSteps: 0, revealedLetters: 0, anagrams: 0, revealedWords: 0, puzzleRevealed: false };
  const assistsUsed = assistSummary.total;
  const displayedElapsedMs = started ? getDisplayedElapsedMs(state, clockNow, typeof document === "undefined" || !document.hidden) : 0;
  const rareSolvedCount = state.run.words.filter((word) => word.frequencyBand === "rare").length;
  const uncommonSolvedCount = state.run.words.filter((word) => word.frequencyBand === "uncommon").length;
  const commonSolvedCount = state.run.words.filter((word) => word.frequencyBand === "common").length;
  const finishedHistoryCount = progress.history.filter((entry) => entry.finished).length;
  const dailyClearCount = Object.values(progress.dailyLedger).filter((outcome) => outcome === "credited" || outcome === "late-clear").length;
  const historicalAssistCount = progress.history.reduce((total, entry) => total + entry.assists.total, 0);
  const availableTopics = topicCatalog.filter((topic) => options.boardView === "quest" || isCrosswordTopic(topic.id));
  const selectedTopicLabels = availableTopics.filter((topic) => options.topics.includes(topic.id)).map((topic) => topic.label);
  const availableContentPacks = contentCatalog.filter((pack) => options.topics.includes(pack.topicId) && (options.boardView === "quest" || isCrosswordContentPack(pack.id)));
  const selectedContentPack = options.contentPackId === "auto" ? null : contentCatalog.find((pack) => pack.id === options.contentPackId) ?? null;
  const basePuzzleSizeRange = getPuzzleSizeRange(options.puzzleFamily, options.boardView);
  const puzzleSizeRange = {
    ...basePuzzleSizeRange,
    max: options.puzzleFamily === "themed" && selectedContentPack
      ? Math.min(basePuzzleSizeRange.max, selectedContentPack.answers.length)
      : basePuzzleSizeRange.max,
  };
  const classicBoardCellClass = state.run.options.style === "classic" ? "border-slate-300/18 bg-slate-50/8 text-slate-50" : "border-white/10 bg-white/6 text-slate-100";
  const classicEmptyCellClass = state.run.options.style === "classic" ? "bg-slate-950/90 border border-slate-700/60" : "bg-transparent";
  const classicBoardShellClass = state.run.options.style === "classic" ? "border-slate-300/18 bg-[#111827]/90 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" : "border-white/10 bg-slate-950/30 p-3";
  const progressPercent = state.run.words.length === 0 ? 0 : (solvedCount / state.run.words.length) * 100;
  const progressRingCircumference = 2 * Math.PI * 42;
  const progressRingOffset = progressRingCircumference - (progressRingCircumference * progressPercent) / 100;
  const secondaryActionClass = "inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/20";
  const secondaryPillClass = "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20";
  const compactPillClass = "inline-flex items-center justify-center rounded-full border border-white/10 bg-white/4 px-3.5 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20";
  const boardCellSizeClass = "size-[clamp(1.9rem,8.2vw,2.45rem)] rounded-md text-xs sm:size-[clamp(2.3rem,6.8vw,2.8rem)] sm:text-sm lg:size-[3.15rem] lg:text-base xl:size-[3.35rem]";
  const familyLabel = options.puzzleFamily === "classic" ? "classic mix" : options.puzzleFamily === "mini" ? "mini run" : "themed run";
  const difficultyLabel = options.challenge === "breeze" ? "breeze" : options.challenge === "quest" ? "standard" : "mythic";
  const boardModeLabel = options.boardView === "quest" ? "trace path" : "crossword";
  const archiveRailClass = rightSidebarOpen
    ? activePlay
      ? "opacity-70 xl:opacity-75"
      : "opacity-85 xl:opacity-90"
    : activePlay
      ? "opacity-85"
      : "opacity-100";
  const isQuestView = state.run.options.boardView === "quest";
  const runDay = state.run.seed.replace(/^daily:/, "");
  const today = getUtcDay(clockNow);
  const isCanonicalDailyAttempt = started && isCanonicalDailyOptions(state.run.options, state.run.seed) && state.startedAt.slice(0, 10) === runDay;
  const isCanonicalDailyCompletion = isCanonicalDailyAttempt && state.completedAt?.slice(0, 10) === runDay;
  const runContextLabel = state.run.options.mode === "custom"
    ? "Custom puzzle"
    : runDay === today
      ? "Today’s daily"
      : `${runDay} daily replay`;
  const todayArchiveEntry = archive.find((entry) => entry.day === today)?.summary ?? null;
  const currentIsTodayDaily = isCanonicalDailyAttempt && runDay === today;
  const todayDailyFinished = Boolean(todayArchiveEntry?.finished || (currentIsTodayDaily && finished));
  const todayDailySolved = currentIsTodayDaily
    ? solvedCount
    : todayArchiveEntry?.solvedCount ?? 0;
  const todayDailyTotal = currentIsTodayDaily
    ? state.run.words.length
    : todayArchiveEntry?.totalWords ?? getCanonicalDailyOptions(clockNow).puzzleSize;
  const reviewedWord = reviewTarget.kind === "word" && isWordReviewAuthorized(state, reviewTarget)
    ? getWordById(state, reviewTarget.wordId)
    : null;
  const puzzleReviewAuthorized = reviewTarget.kind === "puzzle" && isPuzzleReviewAuthorized(state, reviewTarget);
  const visibleReviewKind = reviewedWord ? "word" : puzzleReviewAuthorized ? "puzzle" : null;
  const activeVocabularyUnlocked = isQuestView || Boolean(activeWord && (
    state.solvedIds.includes(activeWord.id)
    || state.assists.revealedWordIds.includes(activeWord.id)
    || state.assists.puzzleRevealed
  ));
  const activeGuessIncorrect = !isQuestView
    && Boolean(activeWord)
    && activeFilledCount === activeWord?.length
    && !state.solvedIds.includes(activeWord?.id ?? "");
  const activeClueName = activePlacement ? `${activePlacement.clueNumber} ${activePlacement.direction}` : "Active clue";
  const activeCluePromptId = activeWord ? `clue-prompt-${activeWord.id}` : undefined;
  const activeClueFeedbackId = activeWord ? `clue-feedback-${activeWord.id}` : undefined;
  const liveMessage = finished
    ? `Puzzle cleared. ${solvedCount} of ${state.run.words.length} words solved.`
    : !started
      ? "Puzzle ready. Start or enter your first answer to begin."
    : state.paused
      ? "Puzzle paused. Entries and new assists are locked."
      : activeGuessIncorrect
        ? `${activeClueName} is not correct yet.`
        : announcement;
  const workspacePanels = [
    { id: "board", label: "Board" },
    { id: "clues", label: "Clues" },
    ...(visibleReviewKind ? [{ id: "review", label: visibleReviewKind === "word" ? "Word" : "Puzzle" } as const] : []),
    { id: "archive", label: "Archive" },
  ] as const;
  const filteredHistory = progress.history
    .filter((entry) => (historyModeFilter === "all" ? true : entry.mode === historyModeFilter))
    .filter((entry) => (historyStatusFilter === "all" ? true : historyStatusFilter === "finished" ? entry.finished : !entry.finished));
  const localSaveHealthy = storageStatus?.tone !== "warning";

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!completionTransitionRef.current.hydrated) {
      completionTransitionRef.current = { hydrated: true, finished };
      return;
    }

    if (finished && !completionTransitionRef.current.finished) {
      window.requestAnimationFrame(() => completionHeadingRef.current?.focus());
    }
    completionTransitionRef.current.finished = finished;
  }, [finished, hydrated]);

  function showToast(message: string, tone: ToastTone = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 1800);
  }

  function commitState(nextState: CurrentRunState) {
    stateRef.current = nextState;
    setState(nextState);
  }

  function startCurrentAttempt(message = "Puzzle started.") {
    const nowMs = readNow();
    const nextState = startPreparedAttempt(stateRef.current, nowMs);
    if (nextState !== stateRef.current) {
      commitState(nextState);
      setClockNow(nowMs);
      setAnnouncement(message);
    }
    return nextState;
  }

  function updateStartedAttempt(update: (current: PersistedRunState) => PersistedRunState, nowMs = readNow()) {
    const startedState = startPreparedAttempt(stateRef.current, nowMs);
    commitState(update(startedState));
    setClockNow(nowMs);
  }

  function commitEntryTransaction(
    update: (current: PersistedRunState) => EntryTransaction,
    nowMs = readNow(),
  ) {
    const attempt = startPreparedAttempt(stateRef.current, nowMs);
    if (!canMutateAttempt(attempt)) {
      return null;
    }

    const transaction = update(attempt);
    if (!transaction.ok) {
      setAnnouncement(transaction.reason === "locked-cell-conflict"
        ? "That crossing is locked by a solved or revealed answer. No letters changed."
        : "That entry could not be applied. No letters changed.");
      return null;
    }

    const nextState = finalizeAttempt(transaction.state, nowMs);
    commitState(nextState);
    setClockNow(nowMs);
    return { state: nextState, changed: transaction.changed };
  }

  function speakWord(word: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      showToast("Speech is unavailable on this device.", "muted");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    showToast("Pronunciation played.");
  }

  function updateOptions<K extends keyof PuzzleOptions>(key: K, value: PuzzleOptions[K]) {
    setOptions((current) => {
      const selectedPack = key === "contentPackId" && value !== "auto"
        ? contentCatalog.find((pack) => pack.id === value)
        : null;
      return normalizeOptions({
        ...current,
        [key]: value,
        ...(selectedPack ? { puzzleSize: Math.min(current.puzzleSize, selectedPack.answers.length) } : {}),
      });
    });
  }

  function applyPreset(preset: BuilderPresetId) {
    const presetOptions: Record<BuilderPresetId, Partial<PuzzleOptions>> = {
      gentle: {
        challenge: "breeze",
        puzzleSize: 6,
        learningMode: true,
      },
      balanced: {
        challenge: "quest",
        puzzleSize: 7,
        learningMode: false,
      },
      study: {
        challenge: "quest",
        puzzleSize: 8,
        learningMode: true,
      },
      deep: {
        challenge: "mythic",
        puzzleSize: 9,
        learningMode: true,
      },
    };

    const nextOptions = normalizeOptions({
      ...options,
      ...presetOptions[preset],
    });
    setOptions(nextOptions);
  }

  function toggleTopic(topicId: TopicId) {
    setOptions((current) => {
      const hasTopic = current.topics.includes(topicId);
      const nextTopics = hasTopic ? current.topics.filter((topic) => topic !== topicId) : [...current.topics, topicId];
      const normalizedTopics = nextTopics.length > 0 ? nextTopics : [topicId];
      const contentPackStillValid = current.contentPackId === "auto" || contentCatalog.some((pack) => pack.id === current.contentPackId && normalizedTopics.includes(pack.topicId));
      return {
        ...current,
        topics: normalizedTopics,
        contentPackId: contentPackStillValid ? current.contentPackId : "auto",
      };
    });
  }

  function finishReplacementRequest(restoreFocus: boolean) {
    const invoker = replacementInvokerRef.current;
    if (replacementDialogRef.current?.open) {
      replacementDialogRef.current.close();
    }
    replacementRequestRef.current = null;
    replacementInvokerRef.current = null;
    replacementFocusRestoreRef.current = restoreFocus ? invoker : null;
    replacementLockRef.current = false;
    replacementCommitInFlightRef.current = false;
    setPendingReplacement(null);
    setIsStarting(false);

  }

  async function commitRunReplacement(request: PendingRunReplacement) {
    if (replacementCommitInFlightRef.current) return;
    replacementCommitInFlightRef.current = true;
    const nowMs = readNow();
    const normalized = request.intent === "today-daily"
      ? getCanonicalDailyOptions(nowMs)
      : normalizeOptions(request.options, nowMs);
    const requestOptions = request.intent === "random-custom" || (normalized.mode === "custom" && !normalized.seed.trim())
      ? { ...normalized, mode: "custom" as const, seed: createRuntimeSeed(nowMs) }
      : normalized;
    setIsStarting(true);
    setRunError(null);
    const result = await replaceRunTransaction({
      current: stateRef.current,
      progress: progressRef.current,
      buildRun: (transitionNowMs) => {
        const run = buildPuzzleRun(requestOptions, transitionNowMs);
        if (request.expectedProvenance && (run.generatorVersion !== request.expectedProvenance.generatorVersion
          || run.corpusRevision !== request.expectedProvenance.corpusRevision
          || run.fingerprintVersion !== request.expectedProvenance.fingerprintVersion
          || run.puzzleFingerprint !== request.expectedProvenance.puzzleFingerprint)) {
          throw new PuzzleGenerationError("unsupported-content", "That saved puzzle no longer matches its recorded fingerprint. Nothing was replaced.");
        }
        return run;
      },
      persist: queueStorageWrite,
      nowMs,
    });

    if (!result.ok) {
      const message = result.reason === "generation-failed"
        ? result.error instanceof PuzzleGenerationError
          ? result.error.message
          : "Could not generate the requested local run. Nothing was replaced."
        : result.storage
          ? getStorageFailureMessage(result.storage)
          : "Could not save your current run, so nothing was replaced.";
      if (result.storage) applyStorageWriteResult(result.storage);
      setRunError(message);
      setAnnouncement(message);
      showToast(message, "muted");
      finishReplacementRequest(true);
      return;
    }

    if (pendingPersistenceTimerRef.current !== null) {
      window.clearTimeout(pendingPersistenceTimerRef.current);
      pendingPersistenceTimerRef.current = null;
    }
    applyStorageWriteResult(result.storage);
    skipBootstrapPersistenceRef.current = false;
    skipNextPersistenceRef.current = true;
    stateRef.current = result.state;
    progressRef.current = result.progress;
    setOptions(result.state.run.options);
    setState(result.state);
    setProgress(result.progress);
    setBootstrapSource("explicit");
    setFocusedCellKey(getFirstOpenCellKey(result.state, result.state.activeWordId));
    setMobilePanel(result.state.run.options.boardView === "crossword" ? "clues" : "board");
    setRevealConfirm({ kind: "none" });
    setShownAnagrams({});
    setQuestPath({ anchor: null, cells: [] });
    questPointerStartRef.current = null;
    questPointerMovedRef.current = false;
    suppressQuestClickRef.current = false;
    setReviewTarget({ kind: "none" });
    setClockNow(nowMs);
    setAnnouncement(result.outgoing
      ? "New puzzle started. Previous progress is saved locally."
      : "New puzzle started and saved locally.");
    finishReplacementRequest(false);
    window.requestAnimationFrame(() => runHeadingRef.current?.focus());
  }

  function startNewRun(
    nextOptions = options,
    expectedProvenance: SharedPuzzleProvenance | null = null,
    intent: PendingRunReplacement["intent"] = "options",
  ) {
    if (replacementLockRef.current) {
      return;
    }
    if (!storageWritableRef.current) {
      const message = storageStatusRef.current?.message ?? "This local save is read-only. Nothing was replaced.";
      setRunError(message);
      setAnnouncement(message);
      showToast(message, "muted");
      return;
    }

    const request = { options: normalizeOptions(nextOptions), expectedProvenance, intent };
    replacementLockRef.current = true;
    replacementInvokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRunError(null);

    if (needsRunReplacementConfirmation(stateRef.current)) {
      replacementRequestRef.current = request;
      setPendingReplacement(request);
      return;
    }

    void commitRunReplacement(request);
  }

  function cancelRunReplacement() {
    if (replacementCommitInFlightRef.current) return;
    finishReplacementRequest(true);
    setAnnouncement("Current run kept. Nothing was replaced.");
  }

  function acceptRunReplacement() {
    const request = replacementRequestRef.current;
    if (!request) {
      finishReplacementRequest(true);
      return;
    }

    void commitRunReplacement(request);
  }

  function replaySavedRun(summary: RunSummary) {
    const replay = resolveSavedRunReplay(summary, readNow());
    void startNewRun(replay.options, replay.kind === "exact" ? replay.expectedProvenance : null);
  }

  function startTodayDailyRun() {
    void startNewRun(options, null, "today-daily");
  }

  function startRandomCustomRun() {
    void startNewRun({
      ...options,
      mode: "custom",
      seed: "",
    }, null, "random-custom");
  }

  function setPortableNotice(tone: "success" | "warning", message: string) {
    setPortableMessage({ tone, message });
    setAnnouncement(message);
    showToast(message, tone === "success" ? "success" : "muted");
  }

  function finishImportRequest(restoreFocus: boolean) {
    const invoker = importInvokerRef.current;
    if (importDialogRef.current?.open) importDialogRef.current.close();
    importCandidateRef.current = null;
    importInvokerRef.current = null;
    importFocusRestoreRef.current = restoreFocus ? invoker : null;
    importCommitInFlightRef.current = false;
    setPendingImportPreview(null);
    setIsImporting(false);
    if (importFileRef.current) importFileRef.current.value = "";
  }

  function adoptPortableState(
    currentAttempt: PersistedRunState | null,
    nextProgress: ProgressSnapshot,
    nowMs: number,
  ) {
    const nextState = currentAttempt
      ? prepareStoredAttempt(currentAttempt, nowMs)
      : createPreparedRunState(buildPuzzleRun(getCanonicalDailyOptions(nowMs), nowMs));
    skipBootstrapPersistenceRef.current = false;
    skipNextPersistenceRef.current = true;
    stateRef.current = nextState;
    progressRef.current = nextProgress;
    setOptions(nextState.run.options);
    setState(nextState);
    setProgress(nextProgress);
    setBootstrapSource(currentAttempt ? "stored" : "current-daily");
    setFocusedCellKey(getFirstOpenCellKey(nextState, nextState.activeWordId));
    setMobilePanel(nextState.run.options.boardView === "crossword" ? "clues" : "board");
    setRevealConfirm({ kind: "none" });
    setShownAnagrams({});
    setQuestPath({ anchor: null, cells: [] });
    setReviewTarget({ kind: "none" });
    setClockNow(nowMs);
  }

  function exportPortableData() {
    const nowMs = readNow();
    const current = stateRef.current;
    const exportProgress = isStartedAttempt(current)
      ? recordRunProgress(progressRef.current, current, nowMs)
      : progressRef.current;
    const backup = createPortableBackup(isStartedAttempt(current) ? current : null, exportProgress, nowMs);
    if (!backup.ok) {
      setPortableNotice("warning", backup.code === "candidate-too-large"
        ? "This local backup is too large to export safely."
        : "This local backup could not be verified for export.");
      return;
    }
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([backup.raw], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backup.filename;
      anchor.click();
      setPortableNotice("success", "Local backup downloaded. It contains puzzle answers and local history; keep it private.");
    } catch {
      setPortableNotice("warning", "This browser could not download the local backup.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function previewPortableFile(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    importInvokerRef.current = input;
    if (file.size > maxPortableBackupBytes) {
      setPortableNotice("warning", "That backup is too large and was not opened.");
      input.value = "";
      return;
    }
    try {
      const preview = previewPortableBackup(await file.text(), readNow());
      if (!preview.ok) {
        const message = preview.code === "future-version"
          ? "That backup was created by a newer Astra Lexa version. Nothing was replaced."
          : preview.code === "backup-too-large"
            ? "That backup is too large and was not opened."
            : "That backup is malformed or failed semantic validation. Nothing was replaced.";
        setPortableNotice("warning", message);
        input.value = "";
        return;
      }
      importCandidateRef.current = preview.candidate;
      setPendingImportPreview(preview.candidate.preview);
    } catch {
      setPortableNotice("warning", "That backup could not be read. Nothing was replaced.");
      input.value = "";
    }
  }

  function cancelPortableImport() {
    if (importCommitInFlightRef.current) return;
    finishImportRequest(true);
    setAnnouncement("Backup import cancelled. Local data was not changed.");
  }

  async function confirmPortableImport() {
    const candidate = importCandidateRef.current;
    if (!candidate || importCommitInFlightRef.current) return;
    importCommitInFlightRef.current = true;
    setIsImporting(true);
    const nowMs = readNow();
    if (pendingPersistenceTimerRef.current !== null) {
      window.clearTimeout(pendingPersistenceTimerRef.current);
      pendingPersistenceTimerRef.current = null;
    }
    await storageSaveQueueRef.current;
    if (!storageWritableRef.current) {
      setPortableNotice("warning", storageStatusRef.current?.message ?? "This local save is read-only. Nothing was replaced.");
      finishImportRequest(true);
      return;
    }

    const current = stateRef.current;
    if (isStartedAttempt(current)) {
      const latestProgress = recordRunProgress(progressRef.current, current, nowMs);
      const flush = await queueStorageWrite(current, latestProgress, nowMs);
      if (!applyStorageWriteResult(flush)) {
        progressRef.current = latestProgress;
        setProgress(latestProgress);
        setPortableNotice("warning", "The latest visible run could not be saved, so the backup was not imported.");
        finishImportRequest(true);
        return;
      }
      progressRef.current = latestProgress;
      setProgress(latestProgress);
    }

    const result = await importPortableBackup(window.localStorage, candidate, {
      expectedSaveId: storageRevisionRef.current,
    }, nowMs);
    if (!result.ok) {
      applyStorageWriteResult(result);
      setPortableNotice("warning", getStorageFailureMessage(result));
      finishImportRequest(true);
      return;
    }
    applyStorageWriteResult(result);
    adoptPortableState(result.currentAttempt, result.progress, nowMs);
    updatePortableUndoAvailability(result.undoAvailable);
    const recoveredStatus = {
      tone: "recovered" as const,
      message: "Backup restored locally. Its history and daily records are self-asserted from this file, not server verified.",
    };
    storageStatusRef.current = recoveredStatus;
    setStorageStatus(recoveredStatus);
    setPortableNotice("success", "Backup imported after verification. Undo is available until a newer change is saved.");
    finishImportRequest(false);
    window.requestAnimationFrame(() => runHeadingRef.current?.focus());
  }

  async function undoPortableDataImport() {
    if (!portableUndoAvailable || isImporting) return;
    await storageSaveQueueRef.current;
    const expectedSaveId = storageRevisionRef.current;
    if (!expectedSaveId || !hasPortableImportUndo(window.localStorage, expectedSaveId)) {
      updatePortableUndoAvailability(false);
      setPortableNotice("warning", "Import undo expired because a newer local change was saved.");
      return;
    }
    setIsImporting(true);
    const nowMs = readNow();
    const result = await undoPortableImport(window.localStorage, { expectedSaveId }, nowMs);
    setIsImporting(false);
    if (!result.ok) {
      if (result.code === "concurrent-write" || result.code === "recovery-required") {
        updatePortableUndoAvailability(false);
        setPortableNotice("warning", "Import undo expired because the local save changed.");
      } else {
        applyStorageWriteResult(result);
        setPortableNotice("warning", getStorageFailureMessage(result));
      }
      return;
    }
    applyStorageWriteResult(result);
    adoptPortableState(result.currentAttempt, result.progress, nowMs);
    updatePortableUndoAvailability(false);
    setPortableNotice("success", "The complete pre-import local save was restored.");
    window.requestAnimationFrame(() => runHeadingRef.current?.focus());
  }

  async function copyCompletionSummary() {
    const summary = [
      `Astra Lexa`,
      `${state.run.title}`,
      `${state.run.words.length} words cleared in ${formatElapsed(displayedElapsedMs)}`,
      `${assistsUsed} assists (${formatAssistBreakdown(assistSummary)})`,
      `seed ${state.run.seed.replace(/^daily:/, "")}`,
    ].join(" | ");

    try {
      await navigator.clipboard.writeText(summary);
      showToast("Run summary copied.");
    } catch {
      showToast("Clipboard unavailable on this device.", "muted");
    }
  }

  function buildDailyResultShareText() {
    const dailySeed = state.run.seed.replace(/^daily:/, "");
    return [
      `Astra Lexa Daily ${dailySeed}`,
      `${state.run.words.length} words`,
      `${formatElapsed(displayedElapsedMs)}`,
      `${assistsUsed} assists`,
      `${commonSolvedCount}/${uncommonSolvedCount}/${rareSolvedCount} mix`,
    ].join(" | ");
  }

  async function shareCurrentRunLink() {
    const shareUrl = buildShareUrl(state.run);
    const sharePayload = {
      title: state.run.title,
      text: `${state.run.title} on Astra Lexa`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
        showToast("Run link shared.");
      } catch {
        showToast("Share cancelled.", "muted");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Run link copied.");
    } catch {
      showToast("Clipboard unavailable. The run link was not copied.", "muted");
    }
  }

  async function shareDailyResult() {
    const shareUrl = buildShareUrl(state.run);
    const text = buildDailyResultShareText();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Astra Lexa Daily ${state.run.seed.replace(/^daily:/, "")}`,
          text,
          url: shareUrl,
        });
        showToast("Daily result shared.");
      } catch {
        showToast("Share cancelled.", "muted");
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} | ${shareUrl}`);
      showToast("Daily result copied.");
    } catch {
      showToast("Clipboard unavailable. The daily result was not copied.", "muted");
    }
  }

  function togglePause() {
    if (finished) {
      return;
    }

    const current = stateRef.current;
    if (!isStartedAttempt(current)) {
      startCurrentAttempt();
      return;
    }

    const nowMs = readNow();
    const willPause = !current.paused;
    if (willPause && isQuestView) {
      clearQuestPathSelection();
    }
    commitState(setAttemptPaused(current, willPause, nowMs));
    setAnnouncement(willPause ? "Puzzle paused. Entries and new assists are locked." : `${activeClueName} selected. Puzzle resumed.`);
    setClockNow(nowMs);
  }

  function revealHint(wordId: string) {
    updateStartedAttempt((current) => recordHintStep(current, wordId));
  }

  function revealAnagram(word: PuzzleWord) {
    if (!canAcceptPlayIntent(state)) {
      return;
    }

    const anagram = buildAnagram(word.answer);
    if (!anagram) {
      showToast("A safe scramble is unavailable for this word.", "muted");
      return;
    }

    updateStartedAttempt((current) => recordAnagram(current, word.id));
    setShownAnagrams((current) => ({
      ...current,
      [word.id]: anagram,
    }));
  }

  function confirmRevealWord() {
    if (!activeWord) {
      return;
    }

    const attempt = startCurrentAttempt("Puzzle started with word review.");
    const target = { kind: "word", attemptId: attempt.attemptId, wordId: activeWord.id } as const;
    revealInvokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    reviewOriginRef.current = { element: revealInvokerRef.current, panel: mobilePanel };
    if (isWordReviewAuthorized(attempt, target)) {
      openAuthorizedReview(target);
      return;
    }

    if (!attempt.paused && canMutateAttempt(attempt)) {
      setRevealConfirm(target);
    }
  }

  function confirmRevealPuzzle() {
    const attempt = startCurrentAttempt("Puzzle started with puzzle review.");
    const target = { kind: "puzzle", attemptId: attempt.attemptId } as const;
    revealInvokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    reviewOriginRef.current = { element: revealInvokerRef.current, panel: mobilePanel };
    if (isPuzzleReviewAuthorized(attempt, target)) {
      openAuthorizedReview(target);
      return;
    }

    if (!attempt.paused && canMutateAttempt(attempt)) {
      setRevealConfirm(target);
    }
  }

  function closeRevealDialog(restoreFocus = true) {
    if (revealDialogRef.current?.open) {
      revealDialogRef.current.close();
    }
    setRevealConfirm({ kind: "none" });

    if (restoreFocus) {
      window.requestAnimationFrame(() => revealInvokerRef.current?.focus());
    }
  }

  function openAuthorizedReview(target: Exclude<ReviewTarget, { kind: "none" }>) {
    setReviewTarget(target);
    setMobilePanel("review");
    closeRevealDialog(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => reviewHeadingRef.current?.focus());
    });
  }

  function closeReview() {
    const origin = reviewOriginRef.current;
    setReviewTarget({ kind: "none" });
    setMobilePanel(origin.panel === "review" ? "board" : origin.panel);
    window.requestAnimationFrame(() => {
      if (origin.element?.isConnected) {
        origin.element.focus();
      }
      reviewOriginRef.current = { element: null, panel: "board" };
    });
  }

  function acceptReveal() {
    const target = revealConfirm;
    const current = stateRef.current;
    if (target.kind === "none" || target.attemptId !== current.attemptId || !isStartedAttempt(current)) {
      closeRevealDialog();
      return;
    }

    if (target.kind === "word") {
      if (!current.run.words.some((word) => word.id === target.wordId)) {
        closeRevealDialog();
        return;
      }

      if (!isWordReviewAuthorized(current, target)) {
        if (!canMutateAttempt(current)) {
          closeRevealDialog();
          return;
        }
        commitState(recordWordReveal(current, target.wordId));
      }
    } else if (!isPuzzleReviewAuthorized(current, target)) {
      if (!canMutateAttempt(current)) {
        closeRevealDialog();
        return;
      }
      commitState(recordPuzzleReveal(current));
    }

    openAuthorizedReview(target);
  }

  function trapDialogFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") {
      return;
    }

    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((control) => !control.hasAttribute("hidden"));
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function clearQuestPathSelection(message = "Quest selection cleared.") {
    setQuestPath({ anchor: null, cells: [] });
    questPointerStartRef.current = null;
    questPointerMovedRef.current = false;
    if (isQuestView) {
      setAnnouncement(message);
    }
  }

  function solveWordById(wordId: string) {
    if (!canAcceptPlayIntent(state)) {
      return false;
    }

    const nowMs = readNow();
    const result = commitEntryTransaction((attempt) => {
      const word = getWordById(attempt, wordId);
      return word
        ? applyWordEntry(attempt, wordId, word.answer)
        : { ok: false, state: attempt, reason: "missing-word" };
    }, nowMs);

    return result !== null;
  }

  function getQuestPathKeys(anchorKey: string, row: number, col: number) {
    const [startRow, startCol] = anchorKey.split(":").map(Number);
    const path = buildLinearQuestPath({ row: startRow, col: startCol }, { row, col });
    return path?.map((entry) => getCellKey(entry.row, entry.col)) ?? null;
  }

  function findQuestPathMatch(pathKeys: string[]) {
    const forward = pathKeys
      .map((pathKey) => {
        const [pathRow, pathCol] = pathKey.split(":").map(Number);
        return getQuestDisplayLetter(cellMap.get(pathKey), state.run.seed, pathRow, pathCol);
      })
      .join("")
      .toLowerCase();
    const backward = forward.split("").reverse().join("");
    return state.run.words.find((word) => !state.solvedIds.includes(word.id) && (word.answer === forward || word.answer === backward)) ?? null;
  }

  function transitionQuestEndpoint(row: number, col: number, anchorOverride?: string | null) {
    if (!canAcceptPlayIntent(state)) {
      setAnnouncement(state.paused ? "Puzzle paused. Quest selection is locked." : "Puzzle complete. Quest selection is read only.");
      return false;
    }

    startCurrentAttempt("Quest started. Choose the other endpoint.");

    const key = getCellKey(row, col);
    const anchor = anchorOverride === undefined ? questPath.anchor : anchorOverride;
    const letter = getQuestDisplayLetter(cellMap.get(key), state.run.seed, row, col).toUpperCase();
    if (!anchor || anchor === key) {
      setQuestPath({ anchor: key, cells: [key] });
      setAnnouncement(`Quest start selected at row ${row + 1} column ${col + 1}, letter ${letter}. Choose a straight-line endpoint.`);
      return false;
    }

    const pathKeys = getQuestPathKeys(anchor, row, col);
    if (!pathKeys || pathKeys.length <= 1) {
      clearQuestPathSelection("That endpoint is not aligned with the start. Quest selection cleared.");
      return false;
    }

    const match = findQuestPathMatch(pathKeys);

    if (match) {
      solveWordById(match.id);
      clearQuestPathSelection(`${match.answer.toUpperCase()} found. ${Math.min(state.run.words.length, solvedCount + 1)} of ${state.run.words.length} complete.`);
      showToast(`Found ${match.answer.toUpperCase()}.`);
      return true;
    }

    clearQuestPathSelection("No unsolved target matches that path. Quest selection cleared.");
    return false;
  }

  function getQuestPointerCell(event: React.PointerEvent<HTMLButtonElement>, fallbackRow: number, fallbackCol: number) {
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-quest-cell='true']");
    const row = Number(element?.dataset.row);
    const col = Number(element?.dataset.col);
    return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : { row: fallbackRow, col: fallbackCol };
  }

  function beginQuestPointer(event: React.PointerEvent<HTMLButtonElement>, row: number, col: number) {
    if (!canAcceptPlayIntent(state)) {
      return;
    }

    startCurrentAttempt("Quest started. Drag to the other endpoint.");

    questPointerStartRef.current = getCellKey(row, col);
    questPointerMovedRef.current = false;
    questPointerPreviousPathRef.current = questPath;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; endpoint clicks remain available.
    }
  }

  function moveQuestPointer(event: React.PointerEvent<HTMLButtonElement>, fallbackRow: number, fallbackCol: number) {
    const startKey = questPointerStartRef.current;
    if (!isStartedAttempt(stateRef.current) || !canMutateAttempt(stateRef.current) || !startKey) {
      return;
    }

    const endpoint = getQuestPointerCell(event, fallbackRow, fallbackCol);
    const endpointKey = getCellKey(endpoint.row, endpoint.col);
    if (endpointKey === startKey) {
      return;
    }

    questPointerMovedRef.current = true;
    const pathKeys = getQuestPathKeys(startKey, endpoint.row, endpoint.col);
    if (!pathKeys) {
      return;
    }

    setQuestPath({ anchor: startKey, cells: pathKeys });
  }

  function finishQuestPointer(event: React.PointerEvent<HTMLButtonElement>, fallbackRow: number, fallbackCol: number) {
    const startKey = questPointerStartRef.current;
    if (!startKey) {
      return;
    }

    const moved = questPointerMovedRef.current;
    const endpoint = getQuestPointerCell(event, fallbackRow, fallbackCol);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    questPointerStartRef.current = null;
    questPointerMovedRef.current = false;

    if (moved) {
      suppressQuestClickRef.current = true;
      window.setTimeout(() => {
        suppressQuestClickRef.current = false;
      }, 0);
      transitionQuestEndpoint(endpoint.row, endpoint.col, startKey);
    }
  }

  function cancelQuestPointer(event: React.PointerEvent<HTMLButtonElement>) {
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    setQuestPath(questPointerPreviousPathRef.current);
    questPointerStartRef.current = null;
    questPointerMovedRef.current = false;
    setAnnouncement("Quest drag canceled.");
  }

  function handleQuestClick(row: number, col: number) {
    if (suppressQuestClickRef.current) {
      suppressQuestClickRef.current = false;
      return;
    }
    transitionQuestEndpoint(row, col);
  }

  function moveQuestCellFocus(row: number, col: number, rowStep: number, colStep: number) {
    const nextRow = row + rowStep;
    const nextCol = col + colStep;
    if (nextRow < 0 || nextCol < 0 || nextRow >= state.run.board.size || nextCol >= state.run.board.size) {
      return;
    }
    focusBoardCellKey(getCellKey(nextRow, nextCol));
  }

  function handleQuestCellKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, row: number, col: number) {
    const movement = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[event.key];
    if (movement) {
      event.preventDefault();
      moveQuestCellFocus(row, col, movement[0], movement[1]);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      transitionQuestEndpoint(row, col);
    } else if (event.key === "Escape") {
      event.preventDefault();
      clearQuestPathSelection();
    }
  }

  function selectWord(wordId: string, intent: WordSelectionIntent = "answer", selectedCellKey?: string) {
    const current = stateRef.current;
    if (!current.run.words.some((word) => word.id === wordId)) {
      return;
    }

    commitState({
      ...current,
      activeWordId: wordId,
    });
    const questMode = current.run.options.boardView === "quest";
    const resolvedIntent = questMode ? "cell" : intent;
    const targetCellKey = selectedCellKey ?? getFirstOpenCellKey(current, wordId);
    setFocusedCellKey(targetCellKey);
    setMobilePanel("board");
    const placement = getPlacementByWordId(current, wordId);
    const word = getWordById(current, wordId);
    if (placement && word) {
      if (questMode) {
        setQuestPath({ anchor: null, cells: [] });
        setAnnouncement(`${word.answer.toUpperCase()} selected, ${word.length} letters. Its first board cell is focused.`);
      } else {
        setAnnouncement(`${placement.clueNumber} ${placement.direction} selected, ${word.length} letters.`);
      }
    }

    window.requestAnimationFrame(() => {
      if (resolvedIntent === "answer" && canAcceptPlayIntent(current) && !current.solvedIds.includes(wordId)) {
        activeAnswerInputRef.current?.focus();
      } else if (targetCellKey) {
        boardCellRefs.current[targetCellKey]?.focus();
      }
    });
  }

  function focusBoardCellKey(cellKey: string) {
    setFocusedCellKey(cellKey);
    const cell = boardCellRefs.current[cellKey];
    if (cell) {
      cell.focus();
    } else {
      window.requestAnimationFrame(() => boardCellRefs.current[cellKey]?.focus());
    }
  }

  function jumpToStudioSection(panel: MobilePanel) {
    const sectionId = panel === "board" ? "studio-board" : panel === "clues" ? "studio-clues" : panel === "review" ? "studio-review" : "studio-archive";
    if (panel === "archive") {
      setRightSidebarOpen(true);
      window.setTimeout(() => {
        const section = document.getElementById(sectionId);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        section?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }, 0);
      return;
    }

    const section = typeof document !== "undefined" ? document.getElementById(sectionId) : null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function handleWorkspaceTabKey(event: React.KeyboardEvent<HTMLButtonElement>, currentPanel: MobilePanel) {
    if (!compactWorkspace || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const currentIndex = workspacePanels.findIndex((panel) => panel.id === currentPanel);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? workspacePanels.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + workspacePanels.length) % workspacePanels.length;
    const nextPanel = workspacePanels[nextIndex]?.id;
    if (nextPanel) {
      setMobilePanel(nextPanel);
      window.requestAnimationFrame(() => workspaceTabRefs.current[nextPanel]?.focus());
    }
  }

  function updateBoardCellEntry(cell: PuzzleBoardCell, nextLetter: string, options?: { moveBackward?: boolean }) {
    if ((!nextLetter && !isStartedAttempt(state)) || !canAcceptPlayIntent(state)) {
      return;
    }

    const preferredWordId = getPreferredWordIdForCell(state, cell, state.activeWordId);
    if (!preferredWordId) {
      return;
    }

    const nowMs = readNow();
    const result = commitEntryTransaction((attempt) => {
      const currentCell = attempt.run.board.cells.find((entry) => entry.row === cell.row && entry.col === cell.col);
      const currentWordId = currentCell ? getPreferredWordIdForCell(attempt, currentCell, attempt.activeWordId) : null;
      return currentWordId
        ? applyCellEntry(attempt, cell.row, cell.col, nextLetter, currentWordId)
        : { ok: false, state: attempt, reason: "missing-word" };
    }, nowMs);
    if (!result) {
      return;
    }

    const nextWord = getWordById(result.state, preferredWordId);
    const nextPlacement = getPlacementByWordId(result.state, preferredWordId);
    if (nextWord && nextPlacement) {
      const nextGuess = deriveGuessFromCells(result.state, preferredWordId);
      const clueLabel = `${nextPlacement.clueNumber} ${nextPlacement.direction}`;
      if (result.state.solvedIds.includes(preferredWordId)) {
        setAnnouncement(`${clueLabel} solved. ${result.state.solvedIds.length} of ${result.state.run.words.length} complete.`);
      } else if (countFilledLetters(nextGuess) === nextWord.length) {
        setAnnouncement(`${clueLabel} is not correct yet.`);
      } else {
        setAnnouncement(`${clueLabel} selected, ${nextWord.length} letters.`);
      }
    }

    const placement = getPlacementByWordId(result.state, preferredWordId);
    if (!placement) {
      return;
    }

    const cells = getWordCells(result.state, placement);
    const currentIndex = cells.findIndex((entry) => entry.row === cell.row && entry.col === cell.col);
    const nextIndex = options?.moveBackward ? currentIndex - 1 : currentIndex + 1;
    const nextCell = cells[nextIndex];

    if (nextCell) {
      focusBoardCellKey(getCellKey(nextCell.row, nextCell.col));
    }
  }

  function handleBoardCellMove(cell: PuzzleBoardCell, rowStep: number, colStep: number) {
    const nextCell = findNeighborCell(state, cell.row, cell.col, rowStep, colStep);
    if (!nextCell) {
      return;
    }

    const nextWordId = getPreferredWordIdForCell(state, nextCell, state.activeWordId);
    if (nextWordId) {
      selectWord(nextWordId, "cell", getCellKey(nextCell.row, nextCell.col));
      return;
    }

    focusBoardCellKey(getCellKey(nextCell.row, nextCell.col));
  }

  function handleBoardCellKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, cell: PuzzleBoardCell) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      handleBoardCellMove(cell, -1, 0);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      handleBoardCellMove(cell, 1, 0);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      handleBoardCellMove(cell, 0, -1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      handleBoardCellMove(cell, 0, 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectWordFromCell(cell);
      return;
    }

    if (!canAcceptPlayIntent(state)) {
      if (event.key === "Backspace" || event.key === "Delete" || /^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      updateBoardCellEntry(cell, "", { moveBackward: event.key === "Backspace" });
      return;
    }

    if (/^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      updateBoardCellEntry(cell, event.key.toLowerCase());
    }
  }

  function jumpToAdjacentClue(step: 1 | -1) {
    const nextWordId = getNextWordId(state, state.activeWordId, step, canAcceptPlayIntent(state));
    if (nextWordId) {
      selectWord(nextWordId, "answer");
    }
  }

  function clearActiveWord() {
    if (!activeWord || !isStartedAttempt(state) || !canMutateAttempt(state)) {
      return;
    }

    const wordId = activeWord.id;
    const result = commitEntryTransaction((attempt) => clearWordEntries(attempt, wordId));
    if (result?.changed) {
      setAnnouncement(`${activeClueName} cleared. Solved and revealed crossings were kept.`);
    }
  }

  function revealActiveLetter() {
    if (!activeWord || !canAcceptPlayIntent(state)) {
      return;
    }

    const nowMs = readNow();
    const result = commitEntryTransaction((attempt) => {
      if (!attempt.activeWordId) {
        return { ok: false, state: attempt, reason: "missing-word" };
      }

      const currentWord = getWordById(attempt, attempt.activeWordId);
      const placement = getPlacementByWordId(attempt, attempt.activeWordId);
      if (!currentWord || !placement) {
        return { ok: false, state: attempt, reason: "missing-word" };
      }

      const cells = getWordCells(attempt, placement);
      const revealIndex = cells.findIndex((cell, index) => (attempt.cellEntries[getCellKey(cell.row, cell.col)] ?? "") !== currentWord.answer[index]);
      if (revealIndex === -1) {
        return { ok: true, state: attempt, changed: false };
      }

      const revealCell = cells[revealIndex];
      const revealedCellKey = getCellKey(revealCell.row, revealCell.col);
      const transaction = applyCellEntry(attempt, revealCell.row, revealCell.col, currentWord.answer[revealIndex], currentWord.id);
      return transaction.ok
        ? { ...transaction, state: recordRevealedCell(transaction.state, revealedCellKey) }
        : transaction;
    }, nowMs);
    if (result?.changed) {
      setAnnouncement("One letter revealed. That crossing is now locked.");
    }
  }

  function updateWordGuess(word: PuzzleWord, value: string) {
    const cleaned = sanitizeGuess(value).slice(0, word.answer.length);
    if ((!cleaned && !isStartedAttempt(state)) || !canAcceptPlayIntent(state)) {
      return;
    }

    const nowMs = readNow();
    const result = commitEntryTransaction((attempt) => applyWordEntry(attempt, word.id, value), nowMs);
    if (!result) {
      return;
    }

    const placement = getPlacementByWordId(result.state, word.id);
    if (!placement) {
      return;
    }
    const clueLabel = `${placement.clueNumber} ${placement.direction}`;
    const nextGuess = deriveGuessFromCells(result.state, word.id);
    if (result.state.solvedIds.includes(word.id)) {
      setAnnouncement(`${clueLabel} solved. ${result.state.solvedIds.length} of ${result.state.run.words.length} complete.`);
    } else if (countFilledLetters(nextGuess) === word.length) {
      setAnnouncement(`${clueLabel} is not correct yet.`);
    } else {
      setAnnouncement(`${clueLabel} selected, ${word.length} letters.`);
    }
  }

  function selectWordFromCell(cell: PuzzleBoardCell) {
    if (cell.wordIds.length === 0) {
      return;
    }

    const currentIndex = cell.wordIds.findIndex((wordId) => wordId === state.activeWordId);
    const nextWordId = currentIndex === -1 ? cell.wordIds[0] : cell.wordIds[(currentIndex + 1) % cell.wordIds.length];
    selectWord(nextWordId, "cell", getCellKey(cell.row, cell.col));
  }

function getClueTone(word: PuzzleWord) {
    switch (word.frequencyBand) {
      case "common":
        return "border-emerald-400/20 bg-emerald-500/8 text-emerald-100";
      case "rare":
        return "border-fuchsia-400/20 bg-fuchsia-500/8 text-fuchsia-100";
      default:
        return "border-white/10 bg-white/4 text-slate-100";
  }
}

function getTargetChipClass(word: PuzzleWord, solved: boolean, active: boolean) {
  if (solved) {
    return "border-emerald-400/35 bg-emerald-500/12 text-emerald-100";
  }

  if (active) {
    return "accent-ring bg-white/6 text-white";
  }

  switch (word.topicId) {
    case "cosmos":
      return "border-sky-400/20 bg-sky-500/8 text-sky-100";
    case "myth":
      return "border-amber-400/20 bg-amber-500/8 text-amber-100";
    case "festival":
      return "border-fuchsia-400/20 bg-fuchsia-500/8 text-fuchsia-100";
    case "winter":
      return "border-cyan-400/20 bg-cyan-500/8 text-cyan-100";
    default:
      return "border-white/10 bg-white/4 text-slate-200";
  }
}

function getSolvedTrailClass(state: CurrentRunState, cell: PuzzleBoardCell) {
  const solvedWordId = cell.wordIds.find((wordId) => state.solvedIds.includes(wordId));
  if (!solvedWordId) {
    return null;
  }

  const solvedIndex = state.run.words.findIndex((word) => word.id === solvedWordId);
  const trailClasses = [
    "border-fuchsia-400/35 bg-fuchsia-500/18 text-fuchsia-100",
    "border-emerald-400/35 bg-emerald-500/18 text-emerald-100",
    "border-amber-400/35 bg-amber-500/18 text-amber-100",
    "border-sky-400/35 bg-sky-500/18 text-sky-100",
    "border-violet-400/35 bg-violet-500/18 text-violet-100",
  ];

  return trailClasses[Math.max(0, solvedIndex) % trailClasses.length];
}

  if (!hydrated) {
    return (
      <main id="puzzle-studio" aria-busy="true" data-bootstrap-state="pending" data-run-state="none" data-hydrated="false" className="scroll-shell style-alpha min-h-screen scroll-mt-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[96rem]">
          <section data-testid="studio-boot" className="glass-card rounded-[2rem] px-5 py-8 sm:px-8">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-300">Local puzzle studio</div>
            <h2 className="mt-3 text-2xl font-semibold text-white">Preparing your puzzle…</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Checking this browser for a resumable attempt before preparing the current UTC daily.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main id="puzzle-studio" aria-busy="false" data-bootstrap-state="ready" data-run-state={started ? "attempt" : "prepared"} data-hydrated="true" className={`scroll-shell ${theme.className} min-h-screen scroll-mt-4 px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <section className="glass-card quest-card-frame quest-card-glow overflow-hidden rounded-[2rem] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-slate-950/45 px-3 py-2">
                  <div className="grid size-8 place-items-center rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(168,85,247,0.22),rgba(96,165,250,0.18))] text-sm">✦</div>
                  <div>
                    <div className="quest-logo text-sm font-black uppercase tracking-[0.12em]">Astra Lexa</div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Word puzzle studio</div>
                  </div>
                </div>
                <nav className="flex flex-wrap gap-2 text-sm text-slate-300">
                  <button type="button" onClick={() => jumpToStudioSection("board")} className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-fuchsia-100">Play</button>
                  <button type="button" onClick={startTodayDailyRun} className={secondaryPillClass}>Daily</button>
                  <button type="button" onClick={() => jumpToStudioSection("archive")} className={secondaryPillClass}>History</button>
                  <button type="button" onClick={() => setLeftSidebarOpen((current) => !current)} className={secondaryPillClass}>Open Setup</button>
                </nav>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:items-center">
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-fuchsia-300">{runContextLabel}</div>
                  <h2 ref={runHeadingRef} tabIndex={-1} data-testid="run-title" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{state.run.title}</h2>
                  <p className="max-w-3xl text-sm leading-6 text-slate-300">{state.run.blurb}</p>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-200">
                    <span data-testid="progress-label" className="accent-chip rounded-full px-3 py-1 font-semibold uppercase tracking-[0.22em]">{progressLabel}</span>
                    <span data-testid="run-status" className="rounded-full border border-white/10 bg-white/4 px-3 py-1 uppercase tracking-[0.2em] text-slate-300">{runStateLabel}</span>
                    <span data-testid="elapsed-time" className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-slate-300">{formatElapsed(displayedElapsedMs)}</span>
                    <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-slate-300">streak {progress.streak}</span>
                    <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-slate-300">{state.run.words[0]?.topicLabel ?? "Mixed"}</span>
                  </div>
                </div>
                <div className="relative mx-auto grid size-32 place-items-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.35),_transparent_60%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(9,14,26,0.88))] shadow-[0_18px_40px_-26px_rgba(96,165,250,0.32)]">
                  <svg viewBox="0 0 100 100" className="absolute inset-3 -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke="url(#questProgressRing)" strokeWidth="8" strokeLinecap="round" strokeDasharray={progressRingCircumference} strokeDashoffset={progressRingOffset} />
                    <defs>
                      <linearGradient id="questProgressRing" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="55%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#c084fc" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="grid size-24 place-items-center rounded-full border border-white/10 bg-slate-950/65 text-center shadow-[inset_0_0_28px_rgba(168,85,247,0.16)]">
                    <div className="text-3xl font-semibold text-white">{solvedCount}/{state.run.words.length}</div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Found</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:w-[23rem] xl:grid-cols-1">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Streak</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-white">{progress.streak}</span>
                  <span className="text-xl">🔥</span>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Best</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-white">{progress.bestStreak}</span>
                  <span className="text-xl">🏆</span>
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Assists</div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold text-white">{assistsUsed}</span>
                  <span className="text-xl">💡</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {storageStatus ? (
          <div
            data-testid="storage-status"
            role="status"
            aria-live="polite"
            className={`rounded-2xl border px-4 py-3 text-sm ${storageStatus.tone === "warning" ? "border-amber-400/35 bg-amber-500/10 text-amber-100" : "border-sky-400/30 bg-sky-500/10 text-sky-100"}`}
          >
            <span className="font-semibold">{storageStatus.tone === "warning" ? "Not saved locally." : "Local save recovered."}</span>{" "}{storageStatus.message}
          </div>
        ) : null}

        <div className="glass-card quest-card-frame flex flex-col gap-3 rounded-[2rem] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Current setup</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">{options.challenge}</span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">{options.puzzleSize} words</span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">{options.mode}</span>
              <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1">{selectedTopicLabels.slice(0, 2).join(" • ")}{selectedTopicLabels.length > 2 ? ` +${selectedTopicLabels.length - 2}` : ""}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLeftSidebarOpen((current) => !current)} className={secondaryActionClass}>
              {leftSidebarOpen ? "Hide setup" : "Tune setup"}
            </button>
            <button type="button" onClick={() => startNewRun()} disabled={isStarting} className="accent-chip inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
              {isStarting ? "Starting..." : "Fresh run"}
            </button>
          </div>
        </div>

        <section className={`glass-card rounded-[2rem] p-4 sm:p-5 ${leftSidebarOpen ? "block" : "hidden"}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Puzzle setup</div>
              <h2 className="mt-1 text-lg font-semibold text-white">Build a new puzzle</h2>
              <p className="mt-1 text-sm text-slate-400">Choose a quick run style, then fine-tune the next puzzle before you start it.</p>
            </div>
            <button data-testid="toggle-left-panel" type="button" aria-expanded={leftSidebarOpen} aria-controls="studio-setup-rail" aria-label={leftSidebarOpen ? "Collapse setup rail" : "Expand setup rail"} onClick={() => setLeftSidebarOpen((current) => !current)} className={compactPillClass}>
              Collapse setup
            </button>
          </div>
          <div id="studio-setup-rail" className="space-y-5">
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                Setup changes apply to the <span className="font-medium text-white">next run</span>, so the active puzzle keeps one stable identity and rule set.
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["custom", "daily"] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => updateOptions("mode", mode)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.mode === mode ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Quick presets</label>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  {([
                    ["gentle", "Gentle / Learn"],
                    ["balanced", "Balanced"],
                    ["study", "Study / Extra help"],
                    ["deep", "Deep challenge"],
                  ] as const).map(([preset, label]) => (
                    <button key={preset} type="button" onClick={() => applyPreset(preset)} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-left text-sm text-slate-200 transition hover:border-white/20">
                      <div className="font-medium text-white">{label}</div>
                      <div className="mt-1 text-xs text-slate-400">{preset === "gentle" ? "Friendly start" : preset === "balanced" ? "Default flow" : preset === "study" ? "More help" : "Harder mix"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Topics</label>
                <div className="flex flex-wrap gap-2">
                  {availableTopics.map((topic) => (
                    <button key={topic.id} type="button" onClick={() => toggleTopic(topic.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${options.topics.includes(topic.id) ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                      {topic.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-400">{options.boardView === "crossword" ? "Crossword topics use reviewed, answer-specific clues." : "Trace path unlocks every local topic and words that fit its 14×14 board."}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Current setup</div>
                    <div className="mt-1 text-slate-200">{familyLabel} · {difficultyLabel} · {options.puzzleSize} words · {options.learningMode ? "learning on" : "learning off"} · {boardModeLabel}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      <span className="rounded-full border border-white/10 px-2.5 py-1">{options.mode}</span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1">{options.topics.length} topics</span>
                      {options.puzzleFamily === "themed" ? <span className="rounded-full border border-white/10 px-2.5 py-1">{options.contentPackId === "auto" ? "auto pack" : selectedContentPack?.label ?? options.contentPackId}</span> : null}
                      <span className="rounded-full border border-white/10 px-2.5 py-1">{options.seed.trim() ? `seeded` : `fresh seed`}</span>
                      <span className="rounded-full border border-white/10 px-2.5 py-1">{options.timerEnabled ? "timer on" : "timer off"}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{selectedTopicLabels.slice(0, 3).join(" • ")}{selectedTopicLabels.length > 3 ? ` +${selectedTopicLabels.length - 3}` : ""}{options.puzzleFamily === "themed" && selectedContentPack ? ` · ${selectedContentPack.label}` : ""}{options.seed.trim() ? ` · ${options.seed}` : ""}</div>
                  </div>
                  <button type="button" onClick={() => setBuilderAdvancedOpen((current) => !current)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-100">
                    {builderAdvancedOpen ? "Hide advanced" : "Show advanced"}
                  </button>
                </div>
              </div>

              <div className={`${builderAdvancedOpen ? "grid" : "hidden"} gap-4`}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Difficulty</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["breeze", "quest", "mythic"] as const).map((level) => (
                      <button key={level} type="button" onClick={() => updateOptions("challenge", level)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.challenge === level ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Quest type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["classic", "mini", "themed"] as const).map((family) => (
                      <button key={family} type="button" onClick={() => updateOptions("puzzleFamily", family)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.puzzleFamily === family ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                        {family === "classic" ? "Classic" : family === "mini" ? "Mini" : "Themed"}
                      </button>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400">Classic mixes broader words, Mini makes a tighter board, and Themed locks onto a curated content lane.</div>
                </div>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Themed content lane</span>
                  <select disabled={options.puzzleFamily !== "themed"} value={options.contentPackId} onChange={(event) => updateOptions("contentPackId", event.target.value as PuzzleOptions["contentPackId"])} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="auto">Auto choose</option>
                    {availableContentPacks.map((pack) => (
                      <option key={pack.id} value={pack.id}>{pack.label}</option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-400">{options.puzzleFamily !== "themed" ? "Themed content lanes unlock when Quest type is set to Themed." : selectedContentPack?.summary ?? (availableContentPacks.length > 0 ? "Pick a tighter content lane or let the generator choose for you." : "Select topics that support curated packs.")}</span>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Target count</span>
                  <input type="range" min={puzzleSizeRange.min} max={puzzleSizeRange.max} value={options.puzzleSize} onChange={(event) => updateOptions("puzzleSize", Number(event.target.value))} className="w-full" />
                  <span>{options.puzzleSize} words · supported range {puzzleSizeRange.min}–{puzzleSizeRange.max}</span>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Theme shell</span>
                  <select value={options.style} onChange={(event) => updateOptions("style", event.target.value as PuzzleOptions["style"])} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none">
                    {themeStyles.map((style) => (
                      <option key={style.id} value={style.id}>{style.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Board interaction</span>
                  <select aria-label="Board mode" value={options.boardView} onChange={(event) => updateOptions("boardView", event.target.value as PuzzleOptions["boardView"])} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none">
                    <option value="crossword">Crossword</option>
                    <option value="quest">Trace path</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{options.mode === "daily" ? "Daily Date" : "Custom Seed"}</span>
                  <input type={options.mode === "daily" ? "date" : "text"} value={options.seed} onChange={(event) => updateOptions("seed", event.target.value)} placeholder={options.mode === "daily" ? getUtcDay() : "Optional seed"} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                  <input type="checkbox" checked={options.timerEnabled} onChange={(event) => updateOptions("timerEnabled", event.target.checked)} className="size-4 rounded border-white/20 bg-slate-950" />
                  Timer enabled
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                  <input type="checkbox" checked={options.learningMode} onChange={(event) => updateOptions("learningMode", event.target.checked)} className="size-4 rounded border-white/20 bg-slate-950" />
                  Learning mode
                </label>
              </div>

              <div className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Quick start</div>
              <button type="button" onClick={() => startNewRun()} disabled={isStarting} className="accent-chip inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60">
                {isStarting ? "Starting..." : "Start Fresh Run"}
              </button>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button type="button" onClick={startTodayDailyRun} className={secondaryActionClass}>
                  Play today&apos;s daily
                </button>
                <button type="button" onClick={startRandomCustomRun} className={secondaryActionClass}>
                  Spin random custom
                </button>
              </div>
              </div>

            {runError ? <p className="text-sm text-rose-300">{runError}</p> : null}
          </div>
        </section>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.9fr)_21rem]">
          <section className="min-w-0 space-y-6">
            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Puzzle workspace</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold text-white">{state.run.title}</h2>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{state.run.options.mode}</span>
                    <span data-testid="run-seed" className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">seed {state.run.seed.replace(/^daily:/, "")}</span>
                  </div>
                  <p className="max-w-4xl text-sm leading-6 text-slate-300">Find all hidden words to complete the puzzle. Keep the board in focus, dip into the clues, and use the side rail for progress and quick controls.</p>
                </div>

                <div className="space-y-3 lg:max-w-md lg:text-right">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Run controls</div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!finished ? (
                      started
                        ? <button type="button" onClick={togglePause} className={secondaryPillClass}>{state.paused ? "Resume" : "Pause"}</button>
                        : <button type="button" data-testid="start-puzzle" onClick={() => startCurrentAttempt()} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold">Start puzzle</button>
                    ) : null}
                    <button type="button" onClick={() => startNewRun(state.run.options)} className={secondaryPillClass}>Restart</button>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Review tools</div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button type="button" onClick={confirmRevealWord} disabled={state.paused && !Boolean(activeWord && (state.solvedIds.includes(activeWord.id) || state.assists.revealedWordIds.includes(activeWord.id) || state.assists.puzzleRevealed))} className={`${secondaryPillClass} disabled:cursor-not-allowed disabled:opacity-40`}>Review Word</button>
                    <button type="button" onClick={confirmRevealPuzzle} disabled={state.paused && !state.assists.puzzleRevealed} className={`${secondaryPillClass} disabled:cursor-not-allowed disabled:opacity-40`}>Review Puzzle</button>
                  </div>
                </div>
              </div>

              <div role={compactWorkspace ? "tablist" : undefined} aria-label={compactWorkspace ? "Puzzle workspace views" : undefined} className={`mt-4 grid gap-2 xl:hidden ${visibleReviewKind ? "grid-cols-4" : "grid-cols-3"}`}>
                {workspacePanels.map(({ id: panelId, label }) => (
                  <button
                    key={panelId}
                    id={`workspace-tab-${panelId}`}
                    ref={(node) => {
                      workspaceTabRefs.current[panelId] = node;
                    }}
                    type="button"
                    onClick={() => setMobilePanel(panelId)}
                    onKeyDown={(event) => handleWorkspaceTabKey(event, panelId)}
                    role={compactWorkspace ? "tab" : undefined}
                    aria-selected={compactWorkspace ? mobilePanel === panelId : undefined}
                    aria-controls={compactWorkspace ? `studio-${panelId}` : undefined}
                    tabIndex={compactWorkspace ? (mobilePanel === panelId ? 0 : -1) : 0}
                    className={`min-h-11 rounded-2xl border px-3 py-2 text-sm transition ${mobilePanel === panelId ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-w-0 space-y-6">
              <div id="studio-board" role={compactWorkspace ? "tabpanel" : "region"} aria-label={compactWorkspace ? undefined : "Puzzle board workspace"} aria-labelledby={compactWorkspace ? "workspace-tab-board" : undefined} hidden={compactWorkspace && mobilePanel !== "board"} className={`${mobilePanel === "board" ? "block" : "hidden"} min-w-0 max-w-full overflow-hidden glass-card rounded-[2rem] p-4 sm:p-6 xl:block`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Puzzle</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">{isQuestView ? "Quest board" : "Puzzle board"}</h3>
                    <p className="mt-1 text-sm text-slate-400">{isQuestView ? "Trace a straight path across the full grid to solve each target word." : "Select a clue and fill the board. Crossing cells can switch between clue directions."}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs text-slate-300">{theme.label}</span>
                    {activePlacement ? <span data-testid="active-clue-badge" className="accent-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">{isQuestView ? "quest view" : `${activePlacement.clueNumber} ${activePlacement.direction}`}</span> : null}
                  </div>
                </div>
                <div className="mb-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <span className="rounded-full border border-white/10 px-3 py-1.5">{isQuestView ? "tap two endpoints" : "tap board to jump"}</span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5">{isQuestView ? "drag a straight path" : "active clue stays highlighted"}</span>
                  <span className="rounded-full border border-white/10 px-3 py-1.5">{isQuestView ? "arrows move · enter selects" : "review stays separate"}</span>
                </div>

                {isQuestView ? (
                  <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.7fr)]">
                    <div id="quest-grid-instructions" className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm leading-6 text-slate-300">
                      Tap a start and endpoint, drag a straight path, or use arrows with Enter or Space. Escape clears the current selection.
                    </div>
                    <div id="quest-grid-status" data-testid="quest-status" className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 px-4 py-3 text-sm font-medium leading-6 text-cyan-100">
                      {liveMessage}
                    </div>
                  </div>
                ) : null}

                {!isQuestView && activeWord ? (
                  <div data-testid="active-clue-panel" className={`mb-5 rounded-[1.5rem] border bg-white/4 p-4 ${activeGuessIncorrect ? "border-rose-400/45" : "border-white/10"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Active clue</div>
                        <div className="mt-1 text-lg font-semibold text-white">{activeClueName} · {activeWord.length} letters</div>
                        <p id={activeCluePromptId} className="mt-2 text-sm text-slate-300">{activeWord.prompt}</p>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getClueTone(activeWord)}`}>{getFrequencyLabel(activeWord.frequencyBand)}</div>
                    </div>
                    <label htmlFor="active-answer-input" className="mt-4 block text-[11px] uppercase tracking-[0.22em] text-slate-400">Answer for {activeClueName}</label>
                    <input
                      id="active-answer-input"
                      ref={activeAnswerInputRef}
                      data-testid="active-answer-input"
                      aria-label={`Answer for ${activeClueName}, ${activeWord.length} letters`}
                      aria-describedby={[activeCluePromptId, activeClueFeedbackId].filter(Boolean).join(" ")}
                      aria-invalid={activeGuessIncorrect || undefined}
                      maxLength={activeWord.length}
                      value={activeGuess}
                      onChange={(event) => updateWordGuess(activeWord, event.target.value)}
                      onKeyDown={(event) => {
                        const target = event.currentTarget;
                        const cursorAtStart = (target.selectionStart ?? 0) === 0 && (target.selectionEnd ?? 0) === 0;
                        const cursorAtEnd = (target.selectionStart ?? target.value.length) === target.value.length && (target.selectionEnd ?? target.value.length) === target.value.length;

                        if (event.key === "Enter") {
                          event.preventDefault();
                          jumpToAdjacentClue(event.shiftKey ? -1 : 1);
                          return;
                        }
                        if ((event.key === "ArrowRight" || event.key === "ArrowDown") && cursorAtEnd) {
                          event.preventDefault();
                          jumpToAdjacentClue(1);
                          return;
                        }
                        if ((event.key === "ArrowLeft" || event.key === "ArrowUp") && cursorAtStart) {
                          event.preventDefault();
                          jumpToAdjacentClue(-1);
                          return;
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          const targetCellKey = boardFocusKey ?? getFirstOpenCellKey(state, activeWord.id);
                          if (targetCellKey) {
                            focusBoardCellKey(targetCellKey);
                          }
                        }
                      }}
                      disabled={!canAcceptPlayIntent(state) || state.solvedIds.includes(activeWord.id)}
                      placeholder={state.paused ? "Paused" : `${activeWord.length} letters`}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm uppercase tracking-[0.25em] text-white placeholder:text-slate-500 disabled:opacity-60"
                    />
                    <div id={activeClueFeedbackId} className={`mt-3 text-sm font-medium ${activeGuessIncorrect ? "text-rose-200" : state.solvedIds.includes(activeWord.id) ? "text-emerald-200" : "text-slate-400"}`}>
                      {state.solvedIds.includes(activeWord.id) ? "✓ Solved" : activeGuessIncorrect ? "Not correct yet" : `${activeFilledCount}/${activeWord.length} letters filled`}
                    </div>
                  </div>
                ) : null}

                <div data-testid="board-scroller" className="max-w-full overflow-auto pb-2">
                  <div role="grid" aria-label={isQuestView ? "Quest word search board" : "Crossword puzzle board"} aria-describedby={isQuestView ? "quest-grid-instructions quest-grid-status" : undefined} aria-rowcount={state.run.board.size} aria-colcount={state.run.board.size} className={`mx-auto grid w-max gap-1 rounded-[1.5rem] border ${classicBoardShellClass}`}>
                    {Array.from({ length: state.run.board.size }, (_, row) => (
                      <div key={row} role="row" aria-rowindex={row + 1} className="flex gap-1">
                        {Array.from({ length: state.run.board.size }, (_, col) => {
                          const key = getCellKey(row, col);
                          const cell = cellMap.get(key);
                          const activeCell = activeWord ? cell?.wordIds.includes(activeWord.id) : false;
                          const solvedCell = cell ? cell.wordIds.every((wordId) => state.solvedIds.includes(wordId)) : false;
                          const solvedTrailClass = cell ? getSolvedTrailClass(state, cell) : null;
                          const selectedQuestCell = questPath.cells.includes(key);

                          if (!cell && !isQuestView) {
                            return <div key={key} role="gridcell" aria-colindex={col + 1} aria-label={`Row ${row + 1} column ${col + 1}, blocked`} className={`${boardCellSizeClass} ${classicEmptyCellClass}`} />;
                          }

                          const displayLetter = cell
                            ? isQuestView
                              ? cell.solution.toUpperCase()
                              : (state.cellEntries[key] ?? "").toUpperCase()
                            : getQuestV3FillLetter(state.run.seed, row, col).toUpperCase();

                          const buttonClass = cell
                            ? activeCell
                              ? `bg-gradient-to-br ${getThemeAccentCellClass(state.run.options.style)} border-white/30 text-white`
                              : solvedTrailClass ?? classicBoardCellClass
                            : "border-white/10 bg-slate-900/65 text-slate-400";

                          return (
                            <button
                              key={key}
                              ref={(node) => {
                                boardCellRefs.current[key] = node;
                              }}
                              data-testid={`board-cell-${row}-${col}`}
                              data-active-cell={activeCell ? "true" : "false"}
                              data-quest-cell={isQuestView ? "true" : undefined}
                              data-row={isQuestView ? row : undefined}
                              data-col={isQuestView ? col : undefined}
                              type="button"
                              role="gridcell"
                              aria-colindex={col + 1}
                              aria-label={isQuestView ? getQuestCellLabel(row, col, displayLetter, selectedQuestCell, questPath.anchor === key) : cell ? getCrosswordCellLabel(state, cell, state.activeWordId) : undefined}
                              aria-selected={isQuestView ? selectedQuestCell : activeCell}
                              aria-readonly={!canAcceptPlayIntent(state)}
                              tabIndex={(isQuestView || cell) && boardFocusKey === key ? 0 : -1}
                              onClick={() => {
                                if (isQuestView) {
                                  handleQuestClick(row, col);
                                } else if (cell) {
                                  selectWordFromCell(cell);
                                }
                              }}
                              onPointerDown={(event) => {
                                if (isQuestView) {
                                  beginQuestPointer(event, row, col);
                                }
                              }}
                              onPointerMove={(event) => {
                                if (isQuestView) {
                                  moveQuestPointer(event, row, col);
                                }
                              }}
                              onPointerUp={(event) => {
                                if (isQuestView) {
                                  finishQuestPointer(event, row, col);
                                }
                              }}
                              onPointerCancel={(event) => {
                                if (isQuestView) {
                                  cancelQuestPointer(event);
                                }
                              }}
                              onFocus={() => {
                                if (isQuestView || cell) {
                                  setFocusedCellKey(key);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (isQuestView) {
                                  handleQuestCellKeyDown(event, row, col);
                                } else if (cell) {
                                  handleBoardCellKeyDown(event, cell);
                                }
                              }}
                              className={`relative border font-semibold uppercase transition ${boardCellSizeClass} ${selectedQuestCell ? "border-cyan-300/55 bg-cyan-400/18 text-white" : buttonClass} ${solvedCell ? "shadow-[0_0_18px_rgba(255,255,255,0.06)]" : ""} ${(isQuestView || cell) && boardFocusKey === key ? "ring-2 ring-white/55" : ""}`}
                            >
                              {!isQuestView && cell?.clueNumbers[0] ? <span className="absolute left-1 top-0.5 text-[9px] font-medium text-slate-400">{cell.clueNumbers[0]}</span> : null}
                              <span>{displayLetter}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {activeWord ? (
                  <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{isQuestView ? "Solve focus" : "Clue support"}</div>
                        <div className="mt-1 text-lg font-semibold text-white">{isQuestView ? activeWord.answer.length + " letters · starts with " + (activeWord.answer[0]?.toUpperCase() ?? "?") : `${activePlacement?.clueNumber}. ${getActiveClueSummary(activeWord, state.run.options.challenge)}`}</div>
                        <div className="mt-2 text-sm text-slate-300">{activeWord.prompt}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{isQuestView ? `${questPath.cells.length || 1}/${activeWord.length} trail cells` : `${activeFilledCount}/${activeWord.length} letters filled`}</div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getClueTone(activeWord)}`}>{getFrequencyLabel(activeWord.frequencyBand)}</div>
                    </div>

                    {isQuestView ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-white/12 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
                        Trace directly on the board: drag a straight line, tap its two endpoints, or use arrows and Enter to mark the same path.
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {activeWord.visuals.slice(0, 3).map((visual, index) => (
                        <div key={visual} className={`relative overflow-hidden rounded-2xl border bg-slate-950/50 px-3 py-4 text-center ${getClueArtTone(activeWord.topicId, activeWord.frequencyBand).rarityTone}`}>
                          <div className={`absolute inset-0 bg-gradient-to-br ${getClueArtTone(activeWord.topicId, activeWord.frequencyBand).baseTone}`} />
                          <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
                          <div className="relative text-[10px] uppercase tracking-[0.28em] text-slate-500">{getClueArtLabel(index)}</div>
                          <div className="relative mt-2 text-sm font-medium capitalize text-white">{getClueCardValue(activeWord, index, state.run.options.challenge)}</div>
                        </div>
                      ))}
                    </div>

                    {state.run.options.learningMode ? activeVocabularyUnlocked ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Vocabulary help</div>
                          <div className="mt-3 space-y-4 text-sm text-slate-200">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Meaning cue</div>
                              <p className="mt-1 text-slate-200">{activeWord.learningNote}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/4 p-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Plain meaning</div>
                              <p className="mt-1 text-slate-200">{activeWord.plainMeaning}</p>
                              <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Use it like this</div>
                              <p className="mt-1 text-slate-200">{activeWord.usageExample}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/4 p-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Pronunciation</div>
                              <div className="mt-2 flex items-center gap-2">
                                <p className="text-slate-200">{activeWord.pronunciationHint}</p>
                                <button type="button" onClick={() => speakWord(activeWord.answer)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-100">
                                  Speak
                                </button>
                              </div>
                              <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Extra cue</div>
                              <p className="mt-1 text-slate-300">{activeWord.microHint}</p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Nearby words</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeWord.relatedWords.map((related) => (
                              <span key={related} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-200">
                                {related}
                              </span>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-5 text-slate-400">{activeWord.translationAid}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
                        Vocabulary examples, pronunciation, and translation notes unlock after you solve this answer or deliberately open its review.
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Keyboard flow</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                      {(isQuestView
                        ? ["Arrows move cells", "Enter selects endpoints", "Esc clears trail"]
                        : ["Enter next", "Shift+Enter back", "Arrows move clues", "Esc exits clue"]
                      ).map((label) => <span key={label} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">{label}</span>)}
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Quick actions</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => jumpToAdjacentClue(-1)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100">
                        Previous clue
                      </button>
                      <button type="button" onClick={() => jumpToAdjacentClue(1)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100">
                        Next clue
                      </button>
                      <button type="button" onClick={revealActiveLetter} disabled={!canAcceptPlayIntent(state) || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        Reveal letter
                      </button>
                      <button type="button" onClick={() => isQuestView ? clearQuestPathSelection() : clearActiveWord()} disabled={!started || !canMutateAttempt(state) || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        {isQuestView ? "Clear trail" : "Clear word"}
                      </button>
                      <button type="button" onClick={() => revealAnagram(activeWord)} disabled={!canAcceptPlayIntent(state) || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        Show scramble
                      </button>
                      </div>
                    </div>

                    {shownAnagrams[activeWord.id] ? <div className="mt-3 rounded-2xl border border-dashed border-white/12 bg-slate-950/45 px-3 py-2 text-sm uppercase tracking-[0.25em] text-slate-200">Scramble: {shownAnagrams[activeWord.id]}</div> : null}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => revealHint(activeWord.id)} disabled={!canAcceptPlayIntent(state) || getHintLevel(activeWord.id, state.assists.hintStepsByWord) >= 3} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        {getHintLevel(activeWord.id, state.assists.hintStepsByWord) >= 3 ? "Hints maxed" : "Get tip"}
                      </button>
                      <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${state.solvedIds.includes(activeWord.id) ? "text-emerald-300" : "text-slate-400"}`}>{state.solvedIds.includes(activeWord.id) ? "Solved" : "In play"}</span>
                    </div>

                    {createHintLadder(activeWord).slice(0, getHintLevel(activeWord.id, state.assists.hintStepsByWord)).map((hint) => (
                      <div key={hint} className="mt-3 rounded-2xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-slate-200">{hint}</div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div id="studio-clues" role={compactWorkspace ? "tabpanel" : "region"} aria-label={compactWorkspace ? undefined : "Puzzle clues"} aria-labelledby={compactWorkspace ? "workspace-tab-clues" : undefined} hidden={compactWorkspace && mobilePanel !== "clues"} className={`${mobilePanel === "clues" ? "block" : "hidden"} glass-card rounded-[2rem] p-5 sm:p-6 xl:block`}>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Across &amp; down</div>
                  <h3 className="mt-1 text-lg font-semibold text-white">Clues</h3>
                  <p className="mt-2 text-sm text-slate-300">Compact clue lanes, with the active word highlighted so you can scan fast and jump back into the board.</p>
                </div>
                <div className="mt-4 grid gap-5 xl:grid-cols-2">
                  {(["across", "down"] as const).map((direction) => (
                    <div key={direction}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{direction}</div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {state.run.board.placements.filter((placement) => placement.direction === direction).length} clues
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {state.run.board.placements.filter((placement) => placement.direction === direction).map((placement) => {
                          const word = getWordById(state, placement.wordId);
                          if (!word) {
                            return null;
                          }
                          const solved = state.solvedIds.includes(word.id);
                          const active = state.activeWordId === placement.wordId;

                          return (
                            <button key={placement.wordId} type="button" aria-current={active ? "true" : undefined} onClick={() => selectWord(placement.wordId, "answer")} className={`w-full rounded-2xl border p-3 text-left transition ${active ? "accent-ring bg-white/6" : "border-white/10 bg-white/4"}`}>
                              <div className="mb-2 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                <span className={solved ? "text-emerald-300" : undefined}>{solved ? "✓ solved" : active ? "active clue" : "ready"}</span>
                                <span>{word.topicLabel}</span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{placement.clueNumber} / {word.length} letters</div>
                                  <div className="mt-1 text-sm text-slate-100">{word.prompt}</div>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${getClueTone(word)}`}>{getFrequencyLabel(word.frequencyBand)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {visibleReviewKind ? (
              <div id="studio-review" role={compactWorkspace ? "tabpanel" : "region"} aria-label={compactWorkspace ? undefined : "Puzzle review"} aria-labelledby={compactWorkspace ? "workspace-tab-review" : undefined} hidden={compactWorkspace && mobilePanel !== "review"} className={`${mobilePanel === "review" ? "block" : "hidden"} glass-card rounded-[2rem] p-5 sm:p-6 xl:block`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Review</div>
                    <h3 ref={reviewHeadingRef} tabIndex={-1} className="mt-1 text-lg font-semibold text-white">{visibleReviewKind === "word" ? "Word Review" : "Puzzle Review"}</h3>
                  </div>
                  <button type="button" onClick={closeReview} className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300">Close</button>
                </div>

                {visibleReviewKind === "word" && reviewedWord ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Answer unlocked</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">{reviewedWord.topicLabel} · {getFrequencyLabel(reviewedWord.frequencyBand)}</div>
                      <div data-testid="review-word-answer" className="mt-2 text-3xl font-semibold uppercase tracking-[0.16em] text-white">{reviewedWord.answer}</div>
                      <p className="mt-3 text-sm text-slate-300">{reviewedWord.prompt}</p>
                      {state.run.options.learningMode ? (
                        <div data-testid="review-vocabulary-support" className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-left">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Vocabulary support</div>
                          <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">Meaning cue</div>
                          <p className="mt-1 text-sm text-slate-200">{reviewedWord.learningNote}</p>
                          <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Plain meaning</div>
                          <p className="mt-1 text-sm text-slate-200">{reviewedWord.plainMeaning}</p>
                          <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Example</div>
                          <p className="mt-1 text-sm text-slate-300">{reviewedWord.usageExample}</p>
                          <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Pronunciation</div>
                          <div className="mt-3 flex items-center gap-2">
                            <p className="text-sm text-slate-300">{reviewedWord.pronunciationHint}</p>
                            <button type="button" onClick={() => speakWord(reviewedWord.answer)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-100">
                              Speak
                            </button>
                          </div>
                          <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Extra cue</div>
                          <p className="mt-1 text-sm text-slate-400">{reviewedWord.microHint}</p>
                          <p className="mt-3 text-sm text-slate-400">{reviewedWord.translationAid}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {reviewedWord.relatedWords.map((related) => (
                              <span key={related} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] capitalize text-slate-200">
                                {related}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Hint ladder</div>
                      <p className="mt-2 text-sm text-slate-300">A clean recap of the clue trail that led to this answer.</p>
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        {createHintLadder(reviewedWord).map((hint, index) => <div key={hint} className="rounded-2xl border border-white/10 px-3 py-2">{index + 1}. {hint}</div>)}
                      </div>
                    </div>
                  </div>
                ) : null}

                {visibleReviewKind === "puzzle" ? (
                  <div>
                    <p className="mb-4 text-sm text-slate-300">Every solved answer, clue reference, and direction in one quick scan.</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {state.run.board.placements.map((placement) => {
                      const word = getWordById(state, placement.wordId);
                      if (!word) {
                        return null;
                      }

                      return (
                        <article key={word.id} className="rounded-3xl border border-white/10 bg-white/4 p-4">
                          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{word.topicLabel} · {getFrequencyLabel(word.frequencyBand)}</div>
                          <div className="flex items-center justify-between gap-3">
                            <div data-testid="review-puzzle-answer" className="text-lg font-semibold uppercase tracking-[0.14em] text-white">{word.answer}</div>
                            <span className="accent-chip rounded-full px-2.5 py-1 text-[11px] capitalize">{placement.clueNumber} {placement.direction}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-300">{word.prompt}</p>
                        </article>
                      );
                    })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {finished && started ? (
              <div data-testid="completion-card" className="completion-burst glass-card relative overflow-hidden rounded-[2rem] p-6 text-center">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.24),_transparent_55%),radial-gradient(circle_at_20%_20%,_rgba(250,204,21,0.16),_transparent_35%),radial-gradient(circle_at_80%_10%,_rgba(192,132,252,0.18),_transparent_40%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center gap-3 opacity-70">
                  <span className="h-2 w-2 rounded-full bg-sky-300 animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-violet-300 animate-pulse [animation-delay:180ms]" />
                  <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse [animation-delay:360ms]" />
                </div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Run complete</div>
                <h3 ref={completionHeadingRef} tabIndex={-1} className="mt-2 text-3xl font-semibold text-white">Puzzle cleared.</h3>
                <p className="mt-3 text-sm text-slate-300">{localSaveHealthy ? (isCanonicalDailyCompletion ? "This canonical clear is saved in your local archive and streak." : "This run is saved in your local history without changing the canonical daily streak.") : "This result is only in this tab until local saving recovers."} Replay the exact puzzle when its recorded provenance matches, review the board, or share the result.</p>

                <div className="mt-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Run recap</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Finish time</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{formatElapsed(displayedElapsedMs)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Assists used</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{assistsUsed}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-400">{formatAssistBreakdown(assistSummary)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Word mix</div>
                    <div className="mt-2 text-sm font-medium text-white">{commonSolvedCount} common / {uncommonSolvedCount} uncommon / {rareSolvedCount} rare</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Seed</div>
                    <div className="mt-2 text-sm font-medium text-white">{state.run.seed.replace(/^daily:/, "")}</div>
                  </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">What next</div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => startNewRun(state.run.options, getExpectedRunProvenance(state.run))} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold">
                    {getExpectedRunProvenance(state.run) ? "Replay exact puzzle" : "Use settings/current rules"}
                  </button>
                  <button type="button" onClick={(event) => { reviewOriginRef.current = { element: event.currentTarget, panel: mobilePanel }; openAuthorizedReview({ kind: "puzzle", attemptId: state.attemptId }); }} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Review full puzzle
                  </button>
                  <button type="button" onClick={startTodayDailyRun} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Play daily
                  </button>
                  </div>
                  <div className="mt-3 text-[11px] uppercase tracking-[0.22em] text-slate-500">Share or save</div>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={shareCurrentRunLink} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Share run link
                  </button>
                  {state.run.options.mode === "daily" ? (
                    <button type="button" onClick={shareDailyResult} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                      Share daily result
                    </button>
                  ) : null}
                  <button type="button" onClick={copyCompletionSummary} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Copy result text
                  </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="glass-card quest-card-glow rounded-[2rem] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Canonical daily</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">Today&apos;s puzzle</h3>
                    <p className="mt-1 text-sm text-slate-300">Only today&apos;s standard rules count toward your daily streak.</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${todayDailyFinished ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-slate-300"}`}>
                    {todayDailyFinished ? "Cleared" : todayDailySolved > 0 ? "In progress" : "Ready"}
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{todayDailySolved}/{todayDailyTotal} words solved</span>
                  <span>{today}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#60a5fa,#c084fc)]" style={{ width: `${todayDailyTotal === 0 ? 0 : Math.min(100, (todayDailySolved / todayDailyTotal) * 100)}%` }} />
                </div>
                <button type="button" onClick={currentIsTodayDaily && !finished ? () => jumpToStudioSection("board") : startTodayDailyRun} className="mt-5 rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm font-medium text-slate-100">
                  {currentIsTodayDaily && !finished ? "Continue today’s daily" : todayDailyFinished ? "Replay today’s daily" : "Start today’s daily"}
                </button>
              </div>

              <div className="glass-card quest-card-frame rounded-[2rem] p-5 sm:p-6">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Local record</div>
                  <h3 className="mt-1 text-lg font-semibold text-white">{localSaveHealthy ? "Facts saved on this device" : "Facts currently in this tab"}</h3>
                  <p className="mt-1 text-sm text-slate-300">{localSaveHealthy ? "No account or remote leaderboard is implied; clearing browser data removes this record." : "Local saving is unavailable, so keep this tab open while you resolve the warning above."}</p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-center">
                  {[
                    [String(dailyClearCount), "Daily clears"],
                    [String(finishedHistoryCount), "Completed runs"],
                    [String(progress.history.length), localSaveHealthy ? "Attempts saved" : "Attempts in tab"],
                    [String(historicalAssistCount), "Assists recorded"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3">
                      <div className="text-xl font-semibold text-white">{value}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`glass-card quest-card-frame rounded-[2rem] p-5 sm:p-6 ${activePlay ? "opacity-95" : "opacity-100"}`}>
              <div className="mb-4">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Daily activity</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Last seven UTC days</h3>
                <p className="mt-1 text-sm text-slate-300">{localSaveHealthy ? "Completed and in-progress markers come only from canonical daily attempts saved in this browser." : "Markers include unsaved changes held only in this tab until local saving recovers."}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {archive.slice(0, 7).map((entry) => (
                  <button key={entry.day} type="button" disabled={!entry.summary} onClick={() => entry.summary && replaySavedRun(entry.summary)} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-left text-sm transition enabled:hover:border-white/20 disabled:cursor-default">
                    <div className="text-xs font-medium text-white">{entry.day === today ? "Today" : entry.day.slice(5)}</div>
                    <div className="mt-2 text-[11px] text-slate-400">{
                      entry.outcome === "credited" ? "Credited"
                        : entry.outcome === "late-clear" ? "Cleared late"
                          : entry.summary ? `${entry.summary.solvedCount}/${entry.summary.totalWords} solved`
                            : entry.outcome === "started" ? "Started" : "No attempt"
                    }</div>
                    {entry.summary ? <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-fuchsia-200">{canReplaySummaryExactly(entry.summary) ? "Replay exact puzzle" : "Use settings/current rules"}</div> : null}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside id="studio-archive" role={compactWorkspace ? "tabpanel" : "region"} aria-label={compactWorkspace ? undefined : "Progress and history"} aria-labelledby={compactWorkspace ? "workspace-tab-archive" : undefined} hidden={compactWorkspace && mobilePanel !== "archive"} className={`${mobilePanel === "archive" ? "block" : "hidden"} min-w-0 space-y-6 xl:sticky xl:top-6 xl:block ${archiveRailClass}`}>
            <div className="hidden xl:flex justify-end">
              <button data-testid="toggle-right-panel" type="button" aria-expanded={rightSidebarOpen} aria-controls="studio-archive-rail" aria-label={rightSidebarOpen ? "Collapse archive rail" : "Expand archive rail"} onClick={() => setRightSidebarOpen((current) => !current)} className={`rounded-full border border-white/10 bg-white/4 text-slate-200 ${rightSidebarOpen ? "px-3 py-1.5 text-xs" : "size-9 text-sm"}`}>
                <span aria-hidden="true">{rightSidebarOpen ? "Collapse archive" : "←"}</span>
              </button>
            </div>
            <div id="studio-archive-rail" className={`${mobilePanel === "archive" ? "space-y-6" : "hidden"} ${rightSidebarOpen ? "lg:space-y-6 lg:block" : "lg:hidden"}`}>
              <div className="glass-card relative overflow-hidden rounded-[2rem] p-5 sm:p-6 bg-[linear-gradient(135deg,rgba(96,165,250,0.16),rgba(15,23,42,0.16))]">
                <div className="pointer-events-none absolute right-4 top-4 text-5xl opacity-15">🧭</div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Progress</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">Quest progress</h3>
                    <p className="mt-1 text-sm text-slate-300">Track momentum without losing focus on the active board.</p>
                  </div>
                  <div className="grid size-18 place-items-center rounded-full border border-white/10 bg-white/6 text-white">
                    <div className="text-2xl font-semibold">{solvedCount}/{state.run.words.length}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-300">Found</div>
                  </div>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#a855f7,#60a5fa)]" style={{ width: `${progressPercent}%` }} />
                </div>
                <div className="mt-3 text-center text-sm text-slate-300">{Math.round(progressPercent)}% Complete</div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                    <div className="text-lg">🔥</div>
                    <div className="mt-1">{progress.streak}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Streak</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                    <div className="text-lg">🏆</div>
                    <div className="mt-1">{progress.bestStreak}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Best</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                    <div className="text-lg">💡</div>
                    <div className="mt-1">{assistsUsed}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Assists</div>
                  </div>
                </div>
              </div>

              <div className="glass-card rounded-[2rem] p-5 sm:p-6 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(9,14,26,0.88))]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{isQuestView ? "Word bank" : "Crossword"}</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">{isQuestView ? "Target words" : "Clue progress"}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{state.run.words.length - solvedCount} left</span>
                </div>
                <div className="space-y-2">
                   {state.run.words.map((word) => {
                     const solved = state.solvedIds.includes(word.id);
                     const placement = getWordPlacement(state, word.id);
                     const maskedAnswer = placement
                       ? getWordCells(state, placement).map((cell) => (state.cellEntries[getCellKey(cell.row, cell.col)] ?? "•").toUpperCase()).join(" ")
                       : `${word.length} letters`;
                     return (
                      <button key={word.id} data-testid={`target-word-${word.id}`} type="button" aria-current={state.activeWordId === word.id ? "true" : undefined} onClick={() => selectWord(word.id)} className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition ${getTargetChipClass(word, solved, state.activeWordId === word.id)}`}>
                        <div className="absolute inset-y-0 left-0 w-1 bg-white/12" />
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-white/95">{isQuestView || solved ? word.answer : maskedAnswer}</span>
                          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{solved ? "done" : `${word.length} letters`}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="glass-card rounded-[2rem] p-5 sm:p-6 opacity-80">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Controls</div>
                <h3 className="mt-1 text-lg font-semibold text-white">Play guide</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-200">
                  {(isQuestView ? [
                    ["⌗", "Choose a start", "Tap or press Enter on the first letter"],
                    ["↔", "Choose an endpoint", "Tap, drag, or use arrows and Enter"],
                    ["⎋", "Clear a trail", "Escape cancels the current selection"],
                    ["💡", "Get a hint", "Use clue tips when you get stuck"],
                    ["👁", "Review word", "Open review for the current word or puzzle"],
                  ] : [
                    ["⌗", "Select a cell", "Tap a cell to start typing"],
                    ["⌨", "Type a letter", "Use your keyboard to fill the answer"],
                    ["⌫", "Delete", "Backspace clears the current entry"],
                    ["💡", "Get a hint", "Use hints when you get stuck"],
                    ["👁", "Reveal word", "Open review for the current word or puzzle"],
                  ]).map(([icon, title, text]) => (
                    <div key={title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-950/50 text-sm">{icon}</div>
                      <div>
                        <div className="font-medium text-white">{title}</div>
                        <div className="mt-1 text-xs text-slate-400">{text}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!finished ? (
                    started
                      ? <button type="button" onClick={togglePause} className="rounded-full border border-white/10 bg-white/4 px-3 py-2 text-xs text-slate-100">{state.paused ? "Resume" : "Pause"}</button>
                      : <button type="button" onClick={() => startCurrentAttempt()} className="accent-chip rounded-full px-3 py-2 text-xs font-semibold">Start puzzle</button>
                  ) : null}
                  <button type="button" onClick={() => startNewRun(state.run.options)} className="rounded-full border border-white/10 bg-white/4 px-3 py-2 text-xs text-slate-100">Restart</button>
                  <button type="button" onClick={shareCurrentRunLink} className="rounded-full border border-white/10 bg-white/4 px-3 py-2 text-xs text-slate-100">Share link</button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-center">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Daily wins</div>
                    <div className="mt-2 text-xl font-semibold text-white">{dailyClearCount}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-center">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Closed runs</div>
                    <div className="mt-2 text-xl font-semibold text-white">{finishedHistoryCount}</div>
                  </div>
                </div>
                <div data-testid="portable-backup-panel" className="mt-6 rounded-3xl border border-amber-300/20 bg-amber-300/6 p-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-amber-100">Local backup</div>
                  <h3 className="mt-1 text-base font-semibold text-white">Move or restore local data</h3>
                  <p className="mt-2 text-xs leading-5 text-amber-50/85">
                    Backup files contain puzzle answers and local history. They stay on this device unless you move the file; keep them private. Import replaces this browser’s attempt, history, and daily ledger after a safe preview—it never merges records.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button data-testid="export-backup" type="button" onClick={exportPortableData} disabled={isImporting} className="rounded-full border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-medium text-amber-50 disabled:opacity-60">Export local backup</button>
                    {portableUndoAvailable ? (
                      <button data-testid="undo-import" type="button" onClick={() => void undoPortableDataImport()} disabled={isImporting} className="rounded-full border border-white/10 bg-white/4 px-3 py-2 text-xs text-slate-100 disabled:opacity-60">Undo last import</button>
                    ) : null}
                  </div>
                  <label className="mt-4 block text-xs font-medium text-slate-200" htmlFor="portable-backup-file">Choose a backup to preview</label>
                  <input
                    ref={importFileRef}
                    id="portable-backup-file"
                    data-testid="import-backup-input"
                    type="file"
                    accept="application/json,.json"
                    disabled={isImporting}
                    onChange={(event) => void previewPortableFile(event)}
                    className="mt-2 block w-full rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/8 file:px-3 file:py-1.5 file:text-xs file:text-white"
                  />
                  {portableMessage ? (
                    <p data-testid="portable-backup-status" role="status" className={`mt-3 text-xs leading-5 ${portableMessage.tone === "success" ? "text-emerald-200" : "text-amber-100"}`}>{portableMessage.message}</p>
                  ) : null}
                </div>
                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Local history</div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">History cards always start a fresh attempt. The action says whether the exact recorded puzzle or only its settings can be reused. {localSaveHealthy ? "Only the current saved attempt resumes when you return to the app." : "Recent changes will not resume after this tab closes unless local saving recovers."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["all", "daily", "custom"] as const).map((mode) => (
                      <button key={mode} type="button" aria-pressed={historyModeFilter === mode} onClick={() => setHistoryModeFilter(mode)} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${historyModeFilter === mode ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100" : "border-white/10 text-slate-300"}`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["all", "finished", "active"] as const).map((status) => (
                      <button key={status} type="button" aria-pressed={historyStatusFilter === status} onClick={() => setHistoryStatusFilter(status)} className={`rounded-full border px-3 py-1.5 text-xs capitalize ${historyStatusFilter === status ? "border-sky-400/30 bg-sky-500/10 text-sky-100" : "border-white/10 text-slate-300"}`}>
                        {status === "active" ? "In progress" : status}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {filteredHistory.slice(0, 4).map((entry) => (
                    <button key={entry.attemptId} data-testid="recent-run-card" type="button" onClick={() => replaySavedRun(entry)} className="w-full rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-left text-sm text-slate-200 transition hover:border-white/20">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-white">{entry.title}</span>
                        <span className="rounded-full bg-white/6 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">{canReplaySummaryExactly(entry) ? "Replay exact puzzle" : "Use settings/current rules"}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span>{entry.mode}{entry.canonicalDaily ? " · canonical" : ""}</span>
                        <span>{entry.solvedCount}/{entry.totalWords} solved</span>
                        <span>{formatElapsed(entry.elapsedMs)}</span>
                        <span>{entry.assists.total} assists</span>
                      </div>
                    </button>
                  ))}
                  {filteredHistory.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-400">No saved runs match these filters.</div> : null}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>

        <dialog
          ref={replacementDialogRef}
          data-testid="run-replacement-dialog"
          aria-modal="true"
          aria-labelledby="replacement-dialog-title"
          aria-describedby="replacement-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            cancelRunReplacement();
          }}
          onKeyDown={trapDialogFocus}
          className="glass-card fixed inset-0 m-auto w-[min(30rem,calc(100%-2rem))] rounded-[2rem] p-6 text-slate-100 backdrop:bg-slate-950/80"
        >
          {pendingReplacement ? (
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Run replacement</div>
              <h3 id="replacement-dialog-title" className="mt-2 text-2xl font-semibold text-white">Replace this unfinished run?</h3>
              <p id="replacement-dialog-description" className="mt-3 text-sm leading-6 text-slate-300">
                Your latest progress will be saved in local history before the new puzzle opens. If saving or generation fails, this run will stay unchanged.
              </p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button ref={replacementCancelRef} type="button" onClick={cancelRunReplacement} disabled={isStarting} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={acceptRunReplacement} disabled={isStarting} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60">{isStarting ? "Saving..." : "Save and replace"}</button>
              </div>
            </div>
          ) : null}
        </dialog>

        <dialog
          ref={importDialogRef}
          data-testid="import-backup-dialog"
          aria-modal="true"
          aria-busy={isImporting}
          aria-labelledby="import-dialog-title"
          aria-describedby="import-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            cancelPortableImport();
          }}
          onKeyDown={trapDialogFocus}
          className="glass-card fixed inset-0 m-auto w-[min(32rem,calc(100%-2rem))] rounded-[2rem] p-6 text-slate-100 backdrop:bg-slate-950/80"
        >
          {pendingImportPreview ? (
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-amber-200">Replace-only local import</div>
              <h3 id="import-dialog-title" className="mt-2 text-2xl font-semibold text-white">Replace local data with this backup?</h3>
              <p id="import-dialog-description" className="mt-3 text-sm leading-6 text-slate-300">
                This answer-bearing file was validated in memory. Confirming replaces the current attempt, history, and daily ledger together. It does not merge records or upload anything.
              </p>
              <dl data-testid="backup-preview" className="mt-5 grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/4 p-4 text-sm">
                <div><dt className="text-xs text-slate-400">Exported</dt><dd className="mt-1 text-white">{new Date(pendingImportPreview.exportedAt).toLocaleString()}</dd></div>
                <div><dt className="text-xs text-slate-400">Current attempt</dt><dd className="mt-1 capitalize text-white">{pendingImportPreview.attemptStatus}</dd></div>
                <div><dt className="text-xs text-slate-400">Recent runs</dt><dd className="mt-1 text-white">{pendingImportPreview.historyCount}</dd></div>
                <div><dt className="text-xs text-slate-400">Daily records</dt><dd className="mt-1 text-white">{pendingImportPreview.creditedDays} credited · {pendingImportPreview.lateClearDays} late</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-amber-100">The preview intentionally hides puzzle answers. Imported daily records are local and self-asserted, not server verified.</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button ref={importCancelRef} type="button" onClick={cancelPortableImport} disabled={isImporting} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100 disabled:opacity-60">Cancel</button>
                <button type="button" onClick={() => void confirmPortableImport()} disabled={isImporting} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60">{isImporting ? "Verifying..." : "Replace local data"}</button>
              </div>
            </div>
          ) : null}
        </dialog>

        <dialog
          ref={revealDialogRef}
          aria-modal="true"
          aria-labelledby="reveal-dialog-title"
          aria-describedby="reveal-dialog-description"
          onCancel={(event) => {
            event.preventDefault();
            closeRevealDialog();
          }}
          onKeyDown={trapDialogFocus}
          className="glass-card fixed inset-0 m-auto w-[min(28rem,calc(100%-2rem))] rounded-[2rem] p-6 text-slate-100 backdrop:bg-slate-950/80"
        >
          {revealConfirm.kind !== "none" ? (
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Review gate</div>
              <h3 id="reveal-dialog-title" className="mt-2 text-2xl font-semibold text-white">{revealConfirm.kind === "word" ? "Reveal this word?" : "Reveal the full puzzle?"}</h3>
              <p id="reveal-dialog-description" className="mt-3 text-sm text-slate-300">{revealConfirm.kind === "word" ? "This will record one word reveal and show only the selected answer in review." : "This will record a full-puzzle reveal and open every answer in review."}</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button ref={revealCancelRef} type="button" onClick={() => closeRevealDialog()} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Cancel</button>
                <button type="button" onClick={acceptReveal} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold">{revealConfirm.kind === "word" ? "Reveal word" : "Reveal puzzle"}</button>
              </div>
            </div>
          ) : null}
        </dialog>

        {toast ? (
          <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center">
            <div className={`rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur ${toast.tone === "success" ? "border-emerald-400/30 bg-emerald-500/18 text-emerald-100" : "border-white/15 bg-slate-950/85 text-slate-100"}`}>
              {toast.message}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
