"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { PersistedRunState, ProgressSnapshot, PuzzleBoardCell, PuzzlePlacement, PuzzleOptions, PuzzleWord, RunSummary, TopicId } from "@/lib/game-types";
import { buildPuzzleRun, createHintLadder, getDefaultDailySeed, sanitizeGuess } from "@/lib/puzzle-generator";
import { buildDailyArchive, createEmptyProgress, readProgressSnapshot, recordRunProgress, writeProgressSnapshot } from "@/lib/progress";
import { getThemeStyle, themeStyles } from "@/lib/themes";
import { topicCatalog, wordBank } from "@/lib/word-bank";

const storageKey = "astra-lexa-session";

type ToastState = {
  tone: "success" | "muted";
  message: string;
} | null;

type ToastTone = NonNullable<ToastState>["tone"];
type HistoryFilterMode = "all" | "daily" | "custom";
type HistoryFilterStatus = "all" | "finished" | "active";
type RevealConfirmState = "none" | "word" | "puzzle";
type BuilderPresetId = "gentle" | "balanced" | "study" | "deep";

const defaultOptions: PuzzleOptions = {
  mode: "custom",
  challenge: "quest",
  topics: ["myth", "cosmos", "greek"],
  puzzleSize: 7,
  style: "alpha",
  clueDensity: 2,
  timerEnabled: true,
  learningMode: false,
  seed: "",
};

function normalizeOptions(input?: Partial<PuzzleOptions>): PuzzleOptions {
  return {
    mode: input?.mode ?? defaultOptions.mode,
    challenge: input?.challenge ?? defaultOptions.challenge,
    topics: input?.topics?.length ? input.topics : defaultOptions.topics,
    puzzleSize: input?.puzzleSize ?? defaultOptions.puzzleSize,
    style: input?.style ?? defaultOptions.style,
    clueDensity: input?.clueDensity ?? defaultOptions.clueDensity,
    timerEnabled: input?.timerEnabled ?? defaultOptions.timerEnabled,
    learningMode: input?.learningMode ?? defaultOptions.learningMode,
    seed: input?.seed ?? (input?.mode === "daily" ? getDefaultDailySeed() : defaultOptions.seed),
  };
}

function createRuntimeSeed() {
  return `custom-${Date.now()}`;
}

function readSharedOptionsFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const seed = params.get("seed");
  const topics = params.get("topics")?.split(",").filter(Boolean) as TopicId[] | undefined;

  if (!mode && !seed && !topics?.length) {
    return null;
  }

  return normalizeOptions({
    mode: mode === "daily" ? "daily" : "custom",
    seed: seed ?? "",
    challenge: (params.get("challenge") as PuzzleOptions["challenge"] | null) ?? undefined,
    style: (params.get("style") as PuzzleOptions["style"] | null) ?? undefined,
    clueDensity: Number(params.get("clueDensity") ?? "") as 1 | 2 | 3,
    puzzleSize: Number(params.get("puzzleSize") ?? "") || undefined,
    timerEnabled: params.get("timerEnabled") ? params.get("timerEnabled") === "true" : undefined,
    learningMode: params.get("learningMode") ? params.get("learningMode") === "true" : undefined,
    topics,
  });
}

function buildShareUrl(options: PuzzleOptions) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const shareSeed = options.mode === "daily" ? options.seed.replace(/^daily:/, "") : options.seed;
  url.searchParams.set("mode", options.mode);
  url.searchParams.set("seed", shareSeed);
  url.searchParams.set("challenge", options.challenge);
  url.searchParams.set("style", options.style);
  url.searchParams.set("puzzleSize", String(options.puzzleSize));
  url.searchParams.set("clueDensity", String(options.clueDensity));
  url.searchParams.set("timerEnabled", String(options.timerEnabled));
  url.searchParams.set("learningMode", String(options.learningMode));
  url.searchParams.set("topics", options.topics.join(","));
  return url.toString();
}

function createStateFromRun(run: PersistedRunState["run"]): PersistedRunState {
  return {
    run,
    guesses: {},
    cellEntries: {},
    solvedIds: [],
    activeWordId: run.words[0]?.id ?? null,
    hintLevels: {},
    paused: false,
    elapsedMs: 0,
    lastTickAt: run.options.timerEnabled ? Date.now() : null,
  };
}

function createFreshState(options: PuzzleOptions): PersistedRunState {
  return createStateFromRun(buildPuzzleRun(options));
}

function readStoredState() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedRunState;
    const normalized = normalizeOptions(parsed.run?.options);

    return {
      options: normalized,
      state: {
        ...parsed,
        guesses: parsed.guesses ?? {},
        cellEntries: parsed.cellEntries ?? {},
        run: {
          ...parsed.run,
          options: normalized,
          seed: parsed.run.seed ?? normalized.seed,
          board: parsed.run.board ?? buildPuzzleRun(normalized).board,
        },
        lastTickAt: parsed.paused || !normalized.timerEnabled ? null : Date.now(),
      },
    };
  } catch {
    return null;
  }
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getWordPlacement(state: PersistedRunState, wordId: string) {
  return state.run.board.placements.find((placement) => placement.wordId === wordId) ?? null;
}

function getWordById(state: PersistedRunState, wordId: string) {
  return state.run.words.find((word) => word.id === wordId) ?? null;
}

function getPlacementByWordId(state: PersistedRunState, wordId: string) {
  return state.run.board.placements.find((placement) => placement.wordId === wordId) ?? null;
}

function getWordCells(state: PersistedRunState, placement: PuzzlePlacement) {
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

function deriveGuessFromCells(state: PersistedRunState, wordId: string) {
  const placement = getWordPlacement(state, wordId);
  if (!placement) {
    return "";
  }

  return getWordCells(state, placement)
    .map((cell) => state.cellEntries[getCellKey(cell.row, cell.col)] ?? "")
    .join("");
}

function computeSolvedIds(state: PersistedRunState) {
  return state.run.words
    .filter((word) => sanitizeGuess(deriveGuessFromCells(state, word.id)) === word.normalized)
    .map((word) => word.id);
}

function getHintLevel(wordId: string, hintLevels: Record<string, number>) {
  return hintLevels[wordId] ?? 0;
}

function buildWordGuessMap(state: PersistedRunState) {
  return Object.fromEntries(state.run.words.map((word) => [word.id, deriveGuessFromCells(state, word.id)]));
}

function getNextWordId(state: PersistedRunState, currentWordId: string | null, step: 1 | -1, preferUnsolved = true) {
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

function buildStateWithEntries(current: PersistedRunState, nextCellEntries: Record<string, string>, fallbackWordId: string) {
  const provisional = {
    ...current,
    cellEntries: nextCellEntries,
  };
  const solvedIds = computeSolvedIds(provisional);
  const nextActive = current.run.words.find((entry) => !solvedIds.includes(entry.id))?.id ?? fallbackWordId;

  return {
    ...provisional,
    guesses: buildWordGuessMap(provisional),
    solvedIds,
    activeWordId: nextActive,
  };
}

function countFilledLetters(value: string) {
  return value.replace(/[^a-z]/g, "").length;
}

function getFirstOpenCellKey(state: PersistedRunState, wordId: string | null) {
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

function findNeighborCell(state: PersistedRunState, row: number, col: number, rowStep: number, colStep: number) {
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

function getPreferredWordIdForCell(state: PersistedRunState, cell: PuzzleBoardCell, preferredWordId: string | null) {
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

function getActiveClueSummary(word: PuzzleWord) {
  return `${word.topicLabel} word · ${word.length} letters · starts with ${word.answer[0]?.toUpperCase() ?? "?"}`;
}

function getClueCardValue(word: PuzzleWord, index: number) {
  if (index === 0) {
    return word.topicLabel;
  }

  if (index === 1) {
    return `${word.answer[0]?.toUpperCase() ?? "?"} starter`;
  }

  return `${word.length} letters`;
}

function buildAnagram(answer: string) {
  if (answer.length < 4) {
    return answer.toUpperCase();
  }

  const chars = answer.toUpperCase().split("");
  const rotated = [...chars.slice(1), chars[0]].join("");
  return rotated === answer.toUpperCase() ? chars.reverse().join("") : rotated;
}

function countFinishedRunsSince(history: ProgressSnapshot["history"], days: number, mode?: RunSummary["mode"]) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(now.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);

  return history.filter((entry) => {
    if (!entry.finished || !entry.completedAt) {
      return false;
    }

    if (mode && entry.mode !== mode) {
      return false;
    }

    return new Date(entry.completedAt) >= cutoff;
  }).length;
}

export function WordPuzzleStudio() {
  const activeAnswerInputRef = useRef<HTMLInputElement | null>(null);
  const boardCellRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [options, setOptions] = useState<PuzzleOptions>(defaultOptions);
  const [state, setState] = useState<PersistedRunState>(() => createFreshState(defaultOptions));
  const [reviewMode, setReviewMode] = useState<"none" | "word" | "puzzle">("none");
  const [mobilePanel, setMobilePanel] = useState<"board" | "clues" | "archive">("board");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [builderAdvancedOpen, setBuilderAdvancedOpen] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState<RevealConfirmState>("none");
  const [shownAnagrams, setShownAnagrams] = useState<Record<string, string>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [historyModeFilter, setHistoryModeFilter] = useState<HistoryFilterMode>("all");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryFilterStatus>("all");
  const [progress, setProgress] = useState<ProgressSnapshot>(createEmptyProgress());
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const lexiconSize = wordBank.length;
  const theme = getThemeStyle(state.run.options.style);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const stored = readStoredState();
      const shared = readSharedOptionsFromUrl();
      const snapshot = readProgressSnapshot();

      setProgress(snapshot);

      if (shared) {
        const nextState = createFreshState(shared);
        startTransition(() => {
          setOptions(shared);
          setState(nextState);
          setFocusedCellKey(getFirstOpenCellKey(nextState, nextState.activeWordId));
        });
      } else if (stored) {
        startTransition(() => {
          setOptions(stored.options);
          setState(stored.state);
        });
      }
    }, 0);

    return () => window.clearTimeout(handle);
  }, []);

  function persistState(nextState: PersistedRunState) {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  }

  function syncProgress(nextState: PersistedRunState) {
    const snapshot = recordRunProgress(readProgressSnapshot(), nextState);
    writeProgressSnapshot(snapshot);
    setProgress(snapshot);
  }

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    if (state.paused || !state.run.options.timerEnabled) {
      return;
    }

    const interval = window.setInterval(() => {
      setState((current) => ({
        ...current,
        elapsedMs: current.elapsedMs + 1000,
      }));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [state.paused, state.run.options.timerEnabled]);

  useEffect(() => {
    if (state.paused) {
      return;
    }

    activeAnswerInputRef.current?.focus();
  }, [state.activeWordId, state.paused]);

  const solvedCount = state.solvedIds.length;
  const activeWord = state.run.words.find((word) => word.id === state.activeWordId) ?? state.run.words[0] ?? null;
  const activePlacement = activeWord ? getWordPlacement(state, activeWord.id) : null;
  const activeGuess = activeWord ? deriveGuessFromCells(state, activeWord.id) : "";
  const finished = solvedCount === state.run.words.length && state.run.words.length > 0;
  const progressLabel = `${solvedCount}/${state.run.words.length} solved`;
  const cellMap = new Map(state.run.board.cells.map((cell) => [getCellKey(cell.row, cell.col), cell]));
  const archive = buildDailyArchive(progress.history, 10);
  const activeFilledCount = countFilledLetters(activeGuess);
  const boardFocusKey = focusedCellKey ?? getFirstOpenCellKey(state, state.activeWordId);
  const hintsUsed = Object.values(state.hintLevels).reduce((total, level) => total + level, 0);
  const rareSolvedCount = state.run.words.filter((word) => word.frequencyBand === "rare").length;
  const uncommonSolvedCount = state.run.words.filter((word) => word.frequencyBand === "uncommon").length;
  const commonSolvedCount = state.run.words.filter((word) => word.frequencyBand === "common").length;
  const finishedHistoryCount = progress.history.filter((entry) => entry.finished).length;
  const activeHistoryCount = progress.history.filter((entry) => !entry.finished).length;
  const dailyClearCount = progress.history.filter((entry) => entry.mode === "daily" && entry.finished).length;
  const weeklyDailyClearCount = countFinishedRunsSince(progress.history, 7, "daily");
  const monthlyDailyClearCount = countFinishedRunsSince(progress.history, 30, "daily");
  const weeklyFinishedRunCount = countFinishedRunsSince(progress.history, 7);
  const classicBoardCellClass = state.run.options.style === "classic" ? "border-slate-300/18 bg-slate-50/8 text-slate-50" : "border-white/10 bg-white/6 text-slate-100";
  const classicEmptyCellClass = state.run.options.style === "classic" ? "bg-slate-950/90 border border-slate-700/60" : "bg-transparent";
  const classicBoardShellClass = state.run.options.style === "classic" ? "border-slate-300/18 bg-[#111827]/90 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" : "border-white/10 bg-slate-950/30 p-3";
  const archiveRailClass = rightSidebarOpen ? "opacity-85 xl:opacity-90" : "opacity-100";
  const filteredHistory = progress.history
    .filter((entry) => (historyModeFilter === "all" ? true : entry.mode === historyModeFilter))
    .filter((entry) => (historyStatusFilter === "all" ? true : historyStatusFilter === "finished" ? entry.finished : !entry.finished));

  function showToast(message: string, tone: ToastTone = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 1800);
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
    setOptions((current) => ({ ...current, [key]: value }));

    if (key === "learningMode") {
      setState((current) => {
        const nextState = {
          ...current,
          run: {
            ...current.run,
            options: {
              ...current.run.options,
              learningMode: value as boolean,
            },
          },
        };
        syncProgress(nextState);
        return nextState;
      });
    }
  }

  function applyPreset(preset: BuilderPresetId) {
    const presetOptions: Record<BuilderPresetId, Partial<PuzzleOptions>> = {
      gentle: {
        challenge: "breeze",
        puzzleSize: 6,
        clueDensity: 3,
        learningMode: true,
      },
      balanced: {
        challenge: "quest",
        puzzleSize: 7,
        clueDensity: 2,
        learningMode: false,
      },
      study: {
        challenge: "quest",
        puzzleSize: 8,
        clueDensity: 3,
        learningMode: true,
      },
      deep: {
        challenge: "mythic",
        puzzleSize: 9,
        clueDensity: 2,
        learningMode: true,
      },
    };

    const nextOptions = normalizeOptions({
      ...options,
      ...presetOptions[preset],
    });
    setOptions(nextOptions);
    setState((current) => ({
      ...current,
      run: {
        ...current.run,
        options: nextOptions,
      },
    }));
  }

  function toggleTopic(topicId: TopicId) {
    setOptions((current) => {
      const hasTopic = current.topics.includes(topicId);
      const nextTopics = hasTopic ? current.topics.filter((topic) => topic !== topicId) : [...current.topics, topicId];
      return {
        ...current,
        topics: nextTopics.length > 0 ? nextTopics : [topicId],
      };
    });
  }

  async function startNewRun(nextOptions = options) {
    const normalized = normalizeOptions(nextOptions);
    const requestOptions = normalized.mode === "custom" && !normalized.seed.trim()
      ? { ...normalized, seed: createRuntimeSeed() }
      : normalized;
    setIsStarting(true);
    setRunError(null);

    try {
      const run = buildPuzzleRun(requestOptions);
      startTransition(() => {
        const nextState = createStateFromRun(run);
        setOptions(run.options);
        setState(nextState);
        setFocusedCellKey(getFirstOpenCellKey(nextState, nextState.activeWordId));
        setMobilePanel("board");
        setRevealConfirm("none");
        setShownAnagrams({});
        syncProgress(nextState);
        setReviewMode("none");
      });
    } catch {
      setRunError("Could not start a new local run.");
    } finally {
      setIsStarting(false);
    }
  }

  function replaySavedRun(summary: RunSummary) {
    const nextOptions = normalizeOptions(summary.options);

    void startNewRun({
      ...nextOptions,
      seed: summary.mode === "daily" ? summary.seed.replace(/^daily:/, "") : nextOptions.seed,
    });
  }

  function startTodayDailyRun() {
    void startNewRun({
      ...options,
      mode: "daily",
      seed: getDefaultDailySeed(),
    });
  }

  function startRandomCustomRun() {
    void startNewRun({
      ...options,
      mode: "custom",
      seed: createRuntimeSeed(),
    });
  }

  async function copyCompletionSummary() {
    const summary = [
      `Astra Lexa`,
      `${state.run.title}`,
      `${state.run.words.length} words cleared in ${formatElapsed(state.elapsedMs)}`,
      `${hintsUsed} hints used`,
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
      `${formatElapsed(state.elapsedMs)}`,
      `${hintsUsed} hints`,
      `${commonSolvedCount}/${uncommonSolvedCount}/${rareSolvedCount} mix`,
    ].join(" | ");
  }

  async function shareCurrentRunLink() {
    const shareUrl = buildShareUrl(state.run.options);
    const sharePayload = {
      title: state.run.title,
      text: `${state.run.title} on Astra Lexa`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(sharePayload);
        showToast("Run link shared.");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Run link copied.");
      }
    } catch {
      showToast("Share cancelled.", "muted");
    }
  }

  async function shareDailyResult() {
    const shareUrl = buildShareUrl({
      ...state.run.options,
      mode: "daily",
      seed: state.run.seed.replace(/^daily:/, ""),
    });
    const text = buildDailyResultShareText();

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Astra Lexa Daily ${state.run.seed.replace(/^daily:/, "")}`,
          text,
          url: shareUrl,
        });
        showToast("Daily result shared.");
      } else {
        await navigator.clipboard.writeText(`${text} | ${shareUrl}`);
        showToast("Daily result copied.");
      }
    } catch {
      showToast("Share cancelled.", "muted");
    }
  }

  function togglePause() {
    setState((current) => {
      const nextState = {
        ...current,
        paused: !current.paused,
      };
      syncProgress(nextState);
      return nextState;
    });
  }

  function revealHint(wordId: string) {
    setState((current) => {
      const nextState = {
        ...current,
        hintLevels: {
          ...current.hintLevels,
          [wordId]: Math.min(3, getHintLevel(wordId, current.hintLevels) + 1),
        },
      };
      syncProgress(nextState);
      return nextState;
    });
  }

  function revealAnagram(word: PuzzleWord) {
    setShownAnagrams((current) => ({
      ...current,
      [word.id]: buildAnagram(word.answer),
    }));
  }

  function confirmRevealWord() {
    setRevealConfirm("word");
  }

  function confirmRevealPuzzle() {
    setRevealConfirm("puzzle");
  }

  function selectWord(wordId: string) {
    setState((current) => {
      const nextState = {
        ...current,
        activeWordId: wordId,
      };
      setFocusedCellKey(getFirstOpenCellKey(nextState, wordId));
      setMobilePanel("board");
      syncProgress(nextState);
      return nextState;
    });
  }

  function focusBoardCellKey(cellKey: string) {
    setFocusedCellKey(cellKey);
    window.requestAnimationFrame(() => {
      boardCellRefs.current[cellKey]?.focus();
    });
  }

  function updateBoardCellEntry(cell: PuzzleBoardCell, nextLetter: string, options?: { moveBackward?: boolean }) {
    const preferredWordId = getPreferredWordIdForCell(state, cell, state.activeWordId);
    if (!preferredWordId) {
      return;
    }

    setState((current) => {
      const nextCellEntries = { ...current.cellEntries };
      const cellKey = getCellKey(cell.row, cell.col);

      if (nextLetter) {
        nextCellEntries[cellKey] = nextLetter;
      } else {
        delete nextCellEntries[cellKey];
      }

      const nextState = buildStateWithEntries(
        {
          ...current,
          activeWordId: preferredWordId,
        },
        nextCellEntries,
        preferredWordId,
      );

      syncProgress(nextState);
      return nextState;
    });

    const placement = getPlacementByWordId(state, preferredWordId);
    if (!placement) {
      return;
    }

    const cells = getWordCells(state, placement);
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
      selectWord(nextWordId);
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
    setState((current) => {
      const nextWordId = getNextWordId(current, current.activeWordId, step);
      if (!nextWordId) {
        return current;
      }

      const nextState = {
        ...current,
        activeWordId: nextWordId,
      };
      setFocusedCellKey(getFirstOpenCellKey(nextState, nextWordId));
      syncProgress(nextState);
      return nextState;
    });
  }

  function clearActiveWord() {
    if (!activeWord) {
      return;
    }

    const placement = getPlacementByWordId(state, activeWord.id);
    if (!placement) {
      return;
    }

    setState((current) => {
      const nextCellEntries = { ...current.cellEntries };
      const cells = getWordCells(current, placement);

      for (const cell of cells) {
        const key = getCellKey(cell.row, cell.col);
        const hasSolvedNeighbor = cell.wordIds.some((wordId) => wordId !== activeWord.id && current.solvedIds.includes(wordId));

        if (!hasSolvedNeighbor) {
          delete nextCellEntries[key];
        }
      }

      const nextState = buildStateWithEntries(current, nextCellEntries, activeWord.id);
      syncProgress(nextState);
      return nextState;
    });
  }

  function revealActiveLetter() {
    if (!activeWord) {
      return;
    }

    const placement = getPlacementByWordId(state, activeWord.id);
    if (!placement) {
      return;
    }

    setState((current) => {
      const nextCellEntries = { ...current.cellEntries };
      const cells = getWordCells(current, placement);
      const revealIndex = cells.findIndex((cell, index) => (nextCellEntries[getCellKey(cell.row, cell.col)] ?? "") !== activeWord.answer[index]);

      if (revealIndex === -1) {
        return current;
      }

      const revealCell = cells[revealIndex];
      nextCellEntries[getCellKey(revealCell.row, revealCell.col)] = activeWord.answer[revealIndex];

      const nextState = buildStateWithEntries(
        {
          ...current,
          hintLevels: {
            ...current.hintLevels,
            [activeWord.id]: Math.min(3, getHintLevel(activeWord.id, current.hintLevels) + 1),
          },
        },
        nextCellEntries,
        activeWord.id,
      );
      syncProgress(nextState);
      return nextState;
    });
  }

  function updateWordGuess(word: PuzzleWord, value: string) {
    const placement = getWordPlacement(state, word.id);
    if (!placement) {
      return;
    }

    const cleaned = sanitizeGuess(value).slice(0, word.answer.length);

    setState((current) => {
      const nextCellEntries = { ...current.cellEntries };

      for (let index = 0; index < word.answer.length; index += 1) {
        const row = placement.row + (placement.direction === "down" ? index : 0);
        const col = placement.col + (placement.direction === "across" ? index : 0);
        const key = getCellKey(row, col);
        const letter = cleaned[index] ?? "";

        if (letter) {
          nextCellEntries[key] = letter;
        } else if (nextCellEntries[key] && current.run.board.cells.find((cell) => cell.row === row && cell.col === col)?.wordIds.length === 1) {
          delete nextCellEntries[key];
        }
      }

      const nextState = buildStateWithEntries(current, nextCellEntries, word.id);

      syncProgress(nextState);
      return nextState;
    });
  }

  function selectWordFromCell(cell: PuzzleBoardCell) {
    if (cell.wordIds.length === 0) {
      return;
    }

    const currentIndex = cell.wordIds.findIndex((wordId) => wordId === state.activeWordId);
    const nextWordId = currentIndex === -1 ? cell.wordIds[0] : cell.wordIds[(currentIndex + 1) % cell.wordIds.length];
    setFocusedCellKey(getCellKey(cell.row, cell.col));
    selectWord(nextWordId);
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

  const desktopLayoutClass = leftSidebarOpen
    ? rightSidebarOpen
      ? "xl:grid-cols-[16rem_minmax(0,1.85fr)_16rem]"
      : "xl:grid-cols-[16rem_minmax(0,2fr)_4rem]"
    : rightSidebarOpen
      ? "xl:grid-cols-[4rem_minmax(0,2fr)_16rem]"
      : "xl:grid-cols-[4rem_minmax(0,2.15fr)_4rem]";

  return (
    <main className={`scroll-shell ${theme.className} min-h-screen px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <section className="glass-card overflow-hidden rounded-[2rem] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="accent-chip inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">Astra Lexa</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{state.run.title}</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{state.run.board.size}x{state.run.board.size}</span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-300">{state.run.options.mode}</span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-300">{state.run.blurb}</p>
            </div>
            <div className="grid gap-2 text-sm text-slate-200 sm:grid-cols-4 lg:min-w-[26rem]">
              <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Progress</div>
                <div className="mt-1 text-lg font-semibold text-white">{progressLabel}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Timer</div>
                <div className="mt-1 text-lg font-semibold text-white">{formatElapsed(state.elapsedMs)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Streak</div>
                <div className="mt-1 text-lg font-semibold text-white">{progress.streak}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">State</div>
                <div className="mt-1 text-lg font-semibold text-white">{finished ? "Done" : state.paused ? "Paused" : "Live"}</div>
              </div>
            </div>
          </div>
        </section>

        <div className={`grid gap-6 ${desktopLayoutClass}`}>
          <aside className="glass-card rounded-[2rem] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className={`${leftSidebarOpen ? "block" : "hidden xl:block"}`}>
                <h2 className="text-lg font-semibold text-white">Run Builder</h2>
                <p className="mt-1 text-sm text-slate-400">Tune mode, challenge, topics, board density, and style.</p>
              </div>
              <button data-testid="toggle-left-panel" type="button" onClick={() => setLeftSidebarOpen((current) => !current)} className="hidden rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-slate-200 xl:inline-flex">
                {leftSidebarOpen ? "Hide" : "Show"}
              </button>
            </div>
            <div className={leftSidebarOpen ? "space-y-5" : "hidden xl:block"}>
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
                <div className="grid gap-2">
                  {([
                    ["gentle", "Gentle / Learn"],
                    ["balanced", "Balanced"],
                    ["study", "Study / Extra help"],
                    ["deep", "Deep challenge"],
                  ] as const).map(([preset, label]) => (
                    <button key={preset} type="button" onClick={() => applyPreset(preset)} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-white/20">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Topics</label>
                <div className="flex flex-wrap gap-2">
                  {topicCatalog.map((topic) => (
                    <button key={topic.id} type="button" onClick={() => toggleTopic(topic.id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${options.topics.includes(topic.id) ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                      {topic.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Current setup</div>
                    <div className="mt-1">{options.challenge} · {options.puzzleSize} words · {options.learningMode ? "learning on" : "learning off"}</div>
                  </div>
                  <button type="button" onClick={() => setBuilderAdvancedOpen((current) => !current)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-100">
                    {builderAdvancedOpen ? "Hide advanced" : "Show advanced"}
                  </button>
                </div>
              </div>

              <div className={`${builderAdvancedOpen ? "grid" : "hidden"} gap-4`}>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Challenge</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["breeze", "quest", "mythic"] as const).map((level) => (
                      <button key={level} type="button" onClick={() => updateOptions("challenge", level)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.challenge === level ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Puzzle Size</span>
                  <input type="range" min={4} max={12} value={options.puzzleSize} onChange={(event) => updateOptions("puzzleSize", Number(event.target.value))} className="w-full" />
                  <span>{options.puzzleSize} words</span>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Clue Density</span>
                  <select value={options.clueDensity} onChange={(event) => updateOptions("clueDensity", Number(event.target.value) as 1 | 2 | 3)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none">
                    <option value={1}>Lean</option>
                    <option value={2}>Balanced</option>
                    <option value={3}>Rich</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Style</span>
                  <select value={options.style} onChange={(event) => updateOptions("style", event.target.value as PuzzleOptions["style"])} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none">
                    {themeStyles.map((style) => (
                      <option key={style.id} value={style.id}>{style.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{options.mode === "daily" ? "Daily Date" : "Custom Seed"}</span>
                  <input type={options.mode === "daily" ? "date" : "text"} value={options.seed} onChange={(event) => updateOptions("seed", event.target.value)} placeholder={options.mode === "daily" ? getDefaultDailySeed() : "Optional seed"} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
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

              <button type="button" onClick={() => startNewRun()} disabled={isStarting} className="accent-chip w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60">
                {isStarting ? "Starting..." : "Start Fresh Run"}
              </button>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button type="button" onClick={startTodayDailyRun} className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-100 transition hover:border-white/20">
                  Play today&apos;s daily
                </button>
                <button type="button" onClick={startRandomCustomRun} className="rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-100 transition hover:border-white/20">
                  Spin random custom
                </button>
              </div>

              {runError ? <p className="text-sm text-rose-300">{runError}</p> : null}
            </div>
          </aside>

          <section className="space-y-6">
            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold text-white">{state.run.title}</h2>
                    <span data-testid="progress-label" className="accent-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">{progressLabel}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{formatElapsed(state.elapsedMs)}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{state.run.options.mode}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">seed {state.run.seed.replace(/^daily:/, "")}</span>
                  </div>
                  <p className="max-w-4xl text-sm leading-6 text-slate-300">{state.run.blurb}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={togglePause} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">{state.paused ? "Resume" : "Pause"}</button>
                  <button type="button" onClick={() => startNewRun(state.run.options)} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Restart</button>
                  <button type="button" onClick={confirmRevealWord} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Review Word</button>
                  <button type="button" onClick={confirmRevealPuzzle} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Review Puzzle</button>
                </div>
              </div>

              <div className="mt-4 flex gap-2 lg:hidden">
                {([
                  ["board", "Board"],
                  ["clues", "Clues"],
                  ["archive", "Archive"],
                ] as const).map(([panelId, label]) => (
                  <button
                    key={panelId}
                    type="button"
                    onClick={() => setMobilePanel(panelId)}
                    className={`flex-1 rounded-2xl border px-3 py-2 text-sm transition ${mobilePanel === panelId ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_19rem]">
              <div className={`${mobilePanel === "board" ? "block" : "hidden"} glass-card rounded-[2rem] p-4 sm:p-6 lg:block`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Board</h3>
                    <p className="mt-1 text-sm text-slate-400">Select a clue and fill the board. Crossing cells can switch between clue directions.</p>
                  </div>
                  {activePlacement ? <span data-testid="active-clue-badge" className="accent-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">{activePlacement.clueNumber} {activePlacement.direction}</span> : null}
                </div>

                <div className="overflow-auto pb-2">
                  <div className={`mx-auto grid w-max gap-1 rounded-[1.5rem] border ${classicBoardShellClass}`}>
                    {Array.from({ length: state.run.board.size }, (_, row) => (
                      <div key={row} className="flex gap-1">
                        {Array.from({ length: state.run.board.size }, (_, col) => {
                          const key = getCellKey(row, col);
                          const cell = cellMap.get(key);
                          const activeCell = activeWord ? cell?.wordIds.includes(activeWord.id) : false;
                          const solvedCell = cell ? cell.wordIds.every((wordId) => state.solvedIds.includes(wordId)) : false;

                          if (!cell) {
                            return <div key={key} className={`size-9 rounded-md sm:size-10 ${classicEmptyCellClass}`} />;
                          }

                          return (
                            <button
                              key={key}
                              ref={(node) => {
                                boardCellRefs.current[key] = node;
                              }}
                              data-testid={`board-cell-${row}-${col}`}
                              type="button"
                              tabIndex={boardFocusKey === key ? 0 : -1}
                              onClick={() => selectWordFromCell(cell)}
                              onFocus={() => setFocusedCellKey(key)}
                              onKeyDown={(event) => handleBoardCellKeyDown(event, cell)}
                              className={`relative size-9 rounded-md border text-sm font-semibold uppercase transition sm:size-10 ${activeCell ? `bg-gradient-to-br ${getThemeAccentCellClass(state.run.options.style)} border-white/30 text-white` : classicBoardCellClass} ${solvedCell ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-100" : ""} ${boardFocusKey === key ? "ring-2 ring-white/55" : ""}`}
                            >
                              {cell.clueNumbers[0] ? <span className="absolute left-1 top-0.5 text-[9px] font-medium text-slate-400">{cell.clueNumbers[0]}</span> : null}
                              <span>{(state.cellEntries[key] ?? "").toUpperCase()}</span>
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
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Clue</div>
                        <div className="mt-1 text-lg font-semibold text-white">{activePlacement?.clueNumber}. {getActiveClueSummary(activeWord)}</div>
                        <div className="mt-2 text-sm text-slate-300">{activeWord.prompt}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">{activeFilledCount}/{activeWord.length} letters filled</div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getClueTone(activeWord)}`}>{getFrequencyLabel(activeWord.frequencyBand)}</div>
                    </div>

                    <input
                      ref={activeAnswerInputRef}
                      data-testid="active-answer-input"
                      aria-label="Active clue answer"
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
                          clearActiveWord();
                        }
                      }}
                      disabled={state.paused || state.solvedIds.includes(activeWord.id)}
                      placeholder={state.paused ? "Paused" : `${activeWord.length} letters`}
                      className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm uppercase tracking-[0.25em] text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                    />

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {activeWord.visuals.slice(0, 3).map((visual, index) => (
                        <div key={visual} className={`relative overflow-hidden rounded-2xl border bg-slate-950/50 px-3 py-4 text-center ${getClueArtTone(activeWord.topicId, activeWord.frequencyBand).rarityTone}`}>
                          <div className={`absolute inset-0 bg-gradient-to-br ${getClueArtTone(activeWord.topicId, activeWord.frequencyBand).baseTone}`} />
                          <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
                          <div className="relative text-[10px] uppercase tracking-[0.28em] text-slate-500">{getClueArtLabel(index)}</div>
                          <div className="relative mt-2 text-sm font-medium capitalize text-white">{getClueCardValue(activeWord, index)}</div>
                        </div>
                      ))}
                    </div>

                    {state.run.options.learningMode ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Vocabulary help</div>
                          <div className="mt-3 space-y-3 text-sm text-slate-200">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Meaning cue</div>
                              <p className="mt-1 text-slate-200">{activeWord.learningNote}</p>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Plain meaning</div>
                              <p className="mt-1 text-slate-200">{activeWord.plainMeaning}</p>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Use it like this</div>
                              <p className="mt-1 text-slate-200">{activeWord.usageExample}</p>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Pronunciation</div>
                              <div className="mt-1 flex items-center gap-2">
                                <p className="text-slate-200">{activeWord.pronunciationHint}</p>
                                <button type="button" onClick={() => speakWord(activeWord.answer)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-100">
                                  Speak
                                </button>
                              </div>
                            </div>
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Extra cue</div>
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
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">Enter next</span>
                      <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">Shift+Enter back</span>
                      <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">Arrows move clues</span>
                      <span className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-slate-300">Esc clears</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => jumpToAdjacentClue(-1)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100">
                        Previous clue
                      </button>
                      <button type="button" onClick={() => jumpToAdjacentClue(1)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100">
                        Next clue
                      </button>
                      <button type="button" onClick={revealActiveLetter} disabled={state.paused || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        Reveal letter
                      </button>
                      <button type="button" onClick={clearActiveWord} disabled={state.paused || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        Clear word
                      </button>
                      <button type="button" onClick={() => revealAnagram(activeWord)} disabled={state.paused || state.solvedIds.includes(activeWord.id)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        Show scramble
                      </button>
                    </div>

                    {shownAnagrams[activeWord.id] ? <div className="mt-3 rounded-2xl border border-dashed border-white/12 bg-slate-950/45 px-3 py-2 text-sm uppercase tracking-[0.25em] text-slate-200">Scramble: {shownAnagrams[activeWord.id]}</div> : null}

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button type="button" onClick={() => revealHint(activeWord.id)} disabled={state.paused || getHintLevel(activeWord.id, state.hintLevels) >= 3} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40">
                        {getHintLevel(activeWord.id, state.hintLevels) >= 3 ? "Hints maxed" : "Get tip"}
                      </button>
                      <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${state.solvedIds.includes(activeWord.id) ? "text-emerald-300" : "text-slate-400"}`}>{state.solvedIds.includes(activeWord.id) ? "Solved" : "In play"}</span>
                    </div>

                    {createHintLadder(activeWord).slice(0, getHintLevel(activeWord.id, state.hintLevels)).map((hint) => (
                      <div key={hint} className="mt-3 rounded-2xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-slate-200">{hint}</div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={`${mobilePanel === "clues" ? "block" : "hidden"} glass-card rounded-[2rem] p-5 sm:p-6 lg:block`}>
                <h3 className="text-lg font-semibold text-white">Clues</h3>
                <div className="mt-4 space-y-5">
                  {(["across", "down"] as const).map((direction) => (
                    <div key={direction}>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{direction}</div>
                      <div className="mt-3 space-y-2">
                        {state.run.board.placements.filter((placement) => placement.direction === direction).map((placement) => {
                          const word = getWordById(state, placement.wordId);
                          if (!word) {
                            return null;
                          }

                          return (
                            <button key={placement.wordId} type="button" onClick={() => selectWord(placement.wordId)} className={`w-full rounded-2xl border p-3 text-left transition ${state.activeWordId === placement.wordId ? "accent-ring bg-white/6" : "border-white/10 bg-white/4"}`}>
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

            {reviewMode !== "none" ? (
              <div className="glass-card rounded-[2rem] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{reviewMode === "word" ? "Word Review" : "Puzzle Review"}</h3>
                  <button type="button" onClick={() => setReviewMode("none")} className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300">Close</button>
                </div>

                {reviewMode === "word" && activeWord ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Current answer</div>
                      <div data-testid="review-word-answer" className="mt-2 text-3xl font-semibold uppercase tracking-[0.16em] text-white">{activeWord.answer}</div>
                      <p className="mt-3 text-sm text-slate-300">{activeWord.prompt}</p>
                      {state.run.options.learningMode ? (
                        <div data-testid="review-vocabulary-support" className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-left">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Vocabulary support</div>
                          <p className="mt-2 text-sm text-slate-200">{activeWord.learningNote}</p>
                          <p className="mt-3 text-sm text-slate-200">{activeWord.plainMeaning}</p>
                          <p className="mt-3 text-sm text-slate-300">{activeWord.usageExample}</p>
                          <div className="mt-3 flex items-center gap-2">
                            <p className="text-sm text-slate-300">{activeWord.pronunciationHint}</p>
                            <button type="button" onClick={() => speakWord(activeWord.answer)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-100">
                              Speak
                            </button>
                          </div>
                          <p className="mt-3 text-sm text-slate-400">{activeWord.microHint}</p>
                          <p className="mt-3 text-sm text-slate-400">{activeWord.translationAid}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {activeWord.relatedWords.map((related) => (
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
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        {createHintLadder(activeWord).map((hint, index) => <div key={hint} className="rounded-2xl border border-white/10 px-3 py-2">{index + 1}. {hint}</div>)}
                      </div>
                    </div>
                  </div>
                ) : null}

                {reviewMode === "puzzle" ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {state.run.board.placements.map((placement) => {
                      const word = getWordById(state, placement.wordId);
                      if (!word) {
                        return null;
                      }

                      return (
                        <article key={word.id} className="rounded-3xl border border-white/10 bg-white/4 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div data-testid="review-puzzle-answer" className="text-lg font-semibold uppercase tracking-[0.14em] text-white">{word.answer}</div>
                            <span className="accent-chip rounded-full px-2.5 py-1 text-[11px] capitalize">{placement.clueNumber} {placement.direction}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-300">{word.prompt}</p>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {finished ? (
              <div data-testid="completion-card" className="completion-burst glass-card relative overflow-hidden rounded-[2rem] p-6 text-center">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.24),_transparent_55%),radial-gradient(circle_at_20%_20%,_rgba(250,204,21,0.16),_transparent_35%),radial-gradient(circle_at_80%_10%,_rgba(192,132,252,0.18),_transparent_40%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center gap-3 opacity-70">
                  <span className="h-2 w-2 rounded-full bg-sky-300 animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-violet-300 animate-pulse [animation-delay:180ms]" />
                  <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse [animation-delay:360ms]" />
                </div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Run complete</div>
                <h3 className="mt-2 text-3xl font-semibold text-white">Puzzle cleared.</h3>
                <p className="mt-3 text-sm text-slate-300">Your archive and streaks have been updated. Replay the same seed, jump into review, or copy the result for later.</p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Finish time</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{formatElapsed(state.elapsedMs)}</div>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/4 p-4 text-left">
                    <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Hints used</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{hintsUsed}</div>
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

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => startNewRun(state.run.options)} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold">
                    Replay run
                  </button>
                  <button type="button" onClick={() => setReviewMode("puzzle")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Review full puzzle
                  </button>
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
                  <button type="button" onClick={startTodayDailyRun} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Play daily
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <aside className={`${mobilePanel === "archive" ? "block" : "hidden"} space-y-6 xl:block ${archiveRailClass}`}>
            <div className="hidden xl:flex justify-end">
              <button data-testid="toggle-right-panel" type="button" onClick={() => setRightSidebarOpen((current) => !current)} className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-slate-200">
                {rightSidebarOpen ? "Hide" : "Show"}
              </button>
            </div>
            <div className={`${mobilePanel === "archive" ? "space-y-6" : "hidden"} ${rightSidebarOpen ? "xl:space-y-6 xl:block" : "xl:hidden"}`}>
            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Archive Insights</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Daily clears</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{dailyClearCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Finished runs</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{finishedHistoryCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Saved runs</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{activeHistoryCount}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Last 7 days</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{weeklyDailyClearCount}</div>
                  <div className="mt-1 text-xs text-slate-400">daily clears</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Last 30 days</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{monthlyDailyClearCount}</div>
                  <div className="mt-1 text-xs text-slate-400">daily clears</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4 sm:col-span-2 xl:col-span-1">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Weekly finish pace</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{weeklyFinishedRunCount}</div>
                  <div className="mt-1 text-xs text-slate-400">finished runs in the last 7 days</div>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Daily Archive</h3>
              <div className="mt-4 space-y-2">
                {archive.map((entry) => (
                  <button key={entry.day} type="button" onClick={() => entry.summary ? replaySavedRun(entry.summary) : startNewRun({ ...options, mode: "daily", seed: entry.day })} className={`w-full rounded-2xl border px-3 py-3 text-left text-sm text-slate-200 transition hover:border-white/20 ${entry.day === getDefaultDailySeed() ? "border-sky-400/30 bg-sky-500/10" : "border-white/10 bg-white/4"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span>{entry.day}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${entry.summary?.finished ? "bg-emerald-500/12 text-emerald-200" : "bg-white/6 text-slate-300"}`}>{entry.summary?.finished ? "replay" : entry.summary ? "resume" : "open"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                      <span>{entry.summary ? `${entry.summary.challenge} / ${entry.summary.solvedCount}-${entry.summary.totalWords}` : "Open this daily seed"}</span>
                      {entry.day === getDefaultDailySeed() ? <span className="text-sky-200">today</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Recent Runs</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ["all", "All"],
                  ["daily", "Daily"],
                  ["custom", "Custom"],
                ] as const).map(([value, label]) => (
                  <button key={value} data-testid={`history-mode-${value}`} type="button" onClick={() => setHistoryModeFilter(value)} className={`rounded-full border px-3 py-1 text-xs transition ${historyModeFilter === value ? "accent-chip" : "border-white/10 bg-white/4 text-slate-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {([
                  ["all", "Any state"],
                  ["finished", "Finished"],
                  ["active", "In progress"],
                ] as const).map(([value, label]) => (
                  <button key={value} data-testid={`history-status-${value}`} type="button" onClick={() => setHistoryStatusFilter(value)} className={`rounded-full border px-3 py-1 text-xs transition ${historyStatusFilter === value ? "accent-chip" : "border-white/10 bg-white/4 text-slate-300"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {filteredHistory.slice(0, 8).map((entry) => (
                  <button key={entry.runId} data-testid="recent-run-card" type="button" onClick={() => replaySavedRun(entry)} className="w-full rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-left text-sm text-slate-200 transition hover:border-white/20">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{entry.title}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{entry.mode} / {entry.challenge} / {entry.solvedCount}-{entry.totalWords}</div>
                        <div className="mt-2 text-xs text-slate-400">{entry.finished ? "Replay the exact run configuration." : "Resume this seeded setup with the same board mix."}</div>
                        <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">seed {entry.seed.replace(/^daily:/, "")}</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${entry.finished ? "bg-emerald-500/12 text-emerald-200" : "bg-white/6 text-slate-300"}`}>{entry.finished ? "replay" : "resume"}</span>
                    </div>
                  </button>
                ))}
                {filteredHistory.length === 0 ? <div className="rounded-2xl border border-white/10 bg-white/4 px-3 py-4 text-sm text-slate-400">No runs match the current filters yet.</div> : null}
              </div>
            </div>
            </div>
          </aside>
        </div>

        {revealConfirm !== "none" ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/72 px-4">
            <div className="glass-card w-full max-w-md rounded-[2rem] p-6">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Confirm reveal</div>
              <h3 className="mt-2 text-2xl font-semibold text-white">{revealConfirm === "word" ? "Reveal this word?" : "Reveal the full puzzle?"}</h3>
              <p className="mt-3 text-sm text-slate-300">{revealConfirm === "word" ? "This will show the current answer in review mode." : "This will open the full puzzle review with every answer visible."}</p>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setRevealConfirm("none")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Cancel</button>
                <button type="button" onClick={() => { setReviewMode(revealConfirm === "word" ? "word" : "puzzle"); setRevealConfirm("none"); }} className="accent-chip rounded-full px-4 py-2 text-sm font-semibold">{revealConfirm === "word" ? "Reveal word" : "Reveal puzzle"}</button>
              </div>
            </div>
          </div>
        ) : null}

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
