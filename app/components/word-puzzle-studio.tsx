"use client";

import { startTransition, useEffect, useState } from "react";
import type { PersistedRunState, ProgressSnapshot, PuzzleBoardCell, PuzzlePlacement, PuzzleOptions, PuzzleWord, TopicId } from "@/lib/game-types";
import { buildPuzzleRun, createHintLadder, getDefaultDailySeed, sanitizeGuess } from "@/lib/puzzle-generator";
import { buildDailyArchive, createEmptyProgress, readProgressSnapshot, recordRunProgress, writeProgressSnapshot } from "@/lib/progress";
import { getThemeStyle, themeStyles } from "@/lib/themes";
import { topicCatalog, wordBank } from "@/lib/word-bank";

const storageKey = "astra-lexa-session";

const defaultOptions: PuzzleOptions = {
  mode: "custom",
  challenge: "quest",
  topics: ["myth", "cosmos", "greek"],
  puzzleSize: 7,
  style: "alpha",
  clueDensity: 2,
  timerEnabled: true,
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
    seed: input?.seed ?? (input?.mode === "daily" ? getDefaultDailySeed() : defaultOptions.seed),
  };
}

function createRuntimeSeed() {
  return `custom-${Date.now()}`;
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

export function WordPuzzleStudio() {
  const [options, setOptions] = useState<PuzzleOptions>(defaultOptions);
  const [state, setState] = useState<PersistedRunState>(() => createFreshState(defaultOptions));
  const [reviewMode, setReviewMode] = useState<"none" | "word" | "puzzle">("none");
  const [isStarting, setIsStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressSnapshot>(createEmptyProgress());
  const lexiconSize = wordBank.length;
  const theme = getThemeStyle(state.run.options.style);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const stored = readStoredState();
      const snapshot = readProgressSnapshot();

      setProgress(snapshot);

      if (stored) {
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

  const solvedCount = state.solvedIds.length;
  const activeWord = state.run.words.find((word) => word.id === state.activeWordId) ?? state.run.words[0] ?? null;
  const activePlacement = activeWord ? getWordPlacement(state, activeWord.id) : null;
  const activeGuess = activeWord ? deriveGuessFromCells(state, activeWord.id) : "";
  const finished = solvedCount === state.run.words.length && state.run.words.length > 0;
  const progressLabel = `${solvedCount}/${state.run.words.length} solved`;
  const cellMap = new Map(state.run.board.cells.map((cell) => [getCellKey(cell.row, cell.col), cell]));
  const archive = buildDailyArchive(progress.history, 10);

  function updateOptions<K extends keyof PuzzleOptions>(key: K, value: PuzzleOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
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
        syncProgress(nextState);
        setReviewMode("none");
      });
    } catch {
      setRunError("Could not start a new local run.");
    } finally {
      setIsStarting(false);
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

  function selectWord(wordId: string) {
    setState((current) => {
      const nextState = {
        ...current,
        activeWordId: wordId,
      };
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

      const provisional = {
        ...current,
        cellEntries: nextCellEntries,
      };
      const solvedIds = computeSolvedIds(provisional);
      const nextActive = current.run.words.find((entry) => !solvedIds.includes(entry.id))?.id ?? word.id;

      const nextState = {
        ...provisional,
        guesses: buildWordGuessMap(provisional),
        solvedIds,
        activeWordId: nextActive,
      };

      syncProgress(nextState);
      return nextState;
    });
  }

  function selectWordFromCell(cell: PuzzleBoardCell) {
    const nextWordId = cell.wordIds.includes(state.activeWordId ?? "") ? cell.wordIds[0] : cell.wordIds[0];
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

  return (
    <main className={`scroll-shell ${theme.className} min-h-screen px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="glass-card overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
              <span className="accent-chip inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">Astra Lexa</span>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Crossword-style English puzzle runs with theme, history, and daily streaks.</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Real placed boards, deterministic seeded runs, visual clue tokens, optional hint ladders, and a lexicon designed to keep expanding.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {theme.greekConstellation.map((item) => (
                  <span key={item} className="accent-chip rounded-full px-3 py-1 font-medium capitalize">{item}</span>
                ))}
                <span className="rounded-full border border-white/10 px-3 py-1 font-medium capitalize text-slate-300">{theme.motif}</span>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-4 lg:min-w-[30rem]">
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Lexicon</div>
                <div className="mt-2 text-2xl font-semibold text-white">{lexiconSize}</div>
                <div className="mt-1 text-xs text-slate-400">Curated and generated English entries</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Board</div>
                <div className="mt-2 text-2xl font-semibold text-white">{state.run.board.size}x{state.run.board.size}</div>
                <div className="mt-1 text-xs text-slate-400">Placed clue grid with overlaps</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Streak</div>
                <div className="mt-2 text-2xl font-semibold text-white">{progress.streak}</div>
                <div className="mt-1 text-xs text-slate-400">Best {progress.bestStreak}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Run State</div>
                <div className="mt-2 text-2xl font-semibold text-white">{finished ? "Done" : state.paused ? "Paused" : "Live"}</div>
                <div className="mt-1 text-xs text-slate-400">Review, restart, archive, and daily tracking</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_20rem]">
          <aside className="glass-card rounded-[2rem] p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Run Builder</h2>
              <p className="mt-1 text-sm text-slate-400">Tune mode, challenge, topics, board density, and style.</p>
            </div>

            <div className="space-y-5">
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
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Challenge</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["breeze", "quest", "mythic"] as const).map((level) => (
                    <button key={level} type="button" onClick={() => updateOptions("challenge", level)} className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.challenge === level ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200"}`}>
                      {level}
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

              <label className="space-y-2 text-sm text-slate-300">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Puzzle Size</span>
                <input type="range" min={4} max={12} value={options.puzzleSize} onChange={(event) => updateOptions("puzzleSize", Number(event.target.value))} className="w-full" />
                <span>{options.puzzleSize} words</span>
              </label>

              <div className="grid gap-4">
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
              </div>

              <button type="button" onClick={() => startNewRun()} disabled={isStarting} className="accent-chip w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60">
                {isStarting ? "Starting..." : "Start Fresh Run"}
              </button>

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
                  <button type="button" onClick={() => setReviewMode("word")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Review Word</button>
                  <button type="button" onClick={() => setReviewMode("puzzle")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">Review Puzzle</button>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="glass-card rounded-[2rem] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Board</h3>
                    <p className="mt-1 text-sm text-slate-400">Select a clue, then type into the active answer bar to fill the placed grid.</p>
                  </div>
                  {activePlacement ? <span className="accent-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">{activePlacement.clueNumber} {activePlacement.direction}</span> : null}
                </div>

                <div className="overflow-auto pb-2">
                  <div className="mx-auto grid w-max gap-1 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-3">
                    {Array.from({ length: state.run.board.size }, (_, row) => (
                      <div key={row} className="flex gap-1">
                        {Array.from({ length: state.run.board.size }, (_, col) => {
                          const key = getCellKey(row, col);
                          const cell = cellMap.get(key);
                          const activeCell = activeWord ? cell?.wordIds.includes(activeWord.id) : false;
                          const solvedCell = cell ? cell.wordIds.every((wordId) => state.solvedIds.includes(wordId)) : false;

                          if (!cell) {
                            return <div key={key} className="size-9 rounded-lg bg-transparent sm:size-10" />;
                          }

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => selectWordFromCell(cell)}
                              className={`relative size-9 rounded-lg border text-sm font-semibold uppercase transition sm:size-10 ${activeCell ? `bg-gradient-to-br ${getThemeAccentCellClass(state.run.options.style)} border-white/30 text-white` : "border-white/10 bg-white/6 text-slate-100"} ${solvedCell ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-100" : ""}`}
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
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Active clue</div>
                        <div className="mt-1 text-lg font-semibold text-white">{activePlacement?.clueNumber}. {activeWord.prompt}</div>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getClueTone(activeWord)}`}>{activeWord.frequencyBand}</div>
                    </div>

                    <input
                      data-testid="active-answer-input"
                      aria-label="Active clue answer"
                      value={activeGuess}
                      onChange={(event) => updateWordGuess(activeWord, event.target.value)}
                      disabled={state.paused || state.solvedIds.includes(activeWord.id)}
                      placeholder={state.paused ? "Paused" : `${activeWord.length} letters`}
                      className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm uppercase tracking-[0.25em] text-white outline-none placeholder:text-slate-500 disabled:opacity-60"
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {activeWord.visuals.slice(0, state.run.options.clueDensity + 1).map((visual) => (
                        <span key={visual} className="accent-chip rounded-full px-2.5 py-1 text-[11px] capitalize">{visual}</span>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {activeWord.visuals.slice(0, 3).map((visual, index) => (
                        <div key={visual} className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-4 text-center">
                          <div className="absolute inset-0 bg-gradient-to-br from-white/8 to-transparent" />
                          <div className="relative text-[10px] uppercase tracking-[0.28em] text-slate-500">clue art {index + 1}</div>
                          <div className="relative mt-2 text-sm font-medium capitalize text-white">{visual}</div>
                        </div>
                      ))}
                    </div>

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

              <div className="glass-card rounded-[2rem] p-5 sm:p-6">
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
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${getClueTone(word)}`}>{word.frequencyBand}</span>
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
                            <div className="text-lg font-semibold uppercase tracking-[0.14em] text-white">{word.answer}</div>
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
              <div className="glass-card rounded-[2rem] p-6 text-center">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Run complete</div>
                <h3 className="mt-2 text-3xl font-semibold text-white">Puzzle cleared.</h3>
                <p className="mt-3 text-sm text-slate-300">Your archive and streaks have been updated. Restart the same seed or launch a fresh constellation.</p>
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Daily Archive</h3>
              <div className="mt-4 space-y-2">
                {archive.map((entry) => (
                  <div key={entry.day} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-sm text-slate-200">
                    <div className="flex items-center justify-between gap-3">
                      <span>{entry.day}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${entry.summary?.finished ? "bg-emerald-500/12 text-emerald-200" : "bg-white/6 text-slate-300"}`}>{entry.summary?.finished ? "cleared" : entry.summary ? "played" : "open"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">Recent Runs</h3>
              <div className="mt-4 space-y-2">
                {progress.history.slice(0, 8).map((entry) => (
                  <div key={entry.runId} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-3 text-sm text-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{entry.title}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{entry.mode} / {entry.challenge} / {entry.solvedCount}-{entry.totalWords}</div>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${entry.finished ? "bg-emerald-500/12 text-emerald-200" : "bg-white/6 text-slate-300"}`}>{entry.finished ? "done" : "saved"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
