"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useState } from "react";
import type { PersistedRunState, PuzzleOptions, PuzzleWord, TopicId } from "@/lib/game-types";
import { buildPuzzleRun, createHintLadder, getDefaultDailySeed, isSolved } from "@/lib/puzzle-generator";
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

function createStateFromRun(run: PersistedRunState["run"]): PersistedRunState {
  return {
    run,
    guesses: {},
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
        run: {
          ...parsed.run,
          options: normalized,
          seed: parsed.run.seed ?? normalized.seed,
        },
        lastTickAt: parsed.paused || !parsed.run.options.timerEnabled ? null : Date.now(),
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

function countSolvedWords(words: PuzzleWord[], solvedIds: string[]) {
  const solvedSet = new Set(solvedIds);
  return words.filter((word) => solvedSet.has(word.id)).length;
}

function getHintLevel(wordId: string, hintLevels: Record<string, number>) {
  return hintLevels[wordId] ?? 0;
}

export function WordPuzzleStudio() {
  const initialStored = readStoredState();
  const [options, setOptions] = useState<PuzzleOptions>(initialStored?.options ?? defaultOptions);
  const [state, setState] = useState<PersistedRunState>(() => initialStored?.state ?? createFreshState(defaultOptions));
  const [reviewMode, setReviewMode] = useState<"none" | "word" | "puzzle">("none");
  const [isStarting, setIsStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const lexiconSize = wordBank.length;

  const persistState = useEffectEvent((nextState: PersistedRunState) => {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
  });

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

  const solvedCount = countSolvedWords(state.run.words, state.solvedIds);
  const activeWord = state.run.words.find((word) => word.id === state.activeWordId) ?? state.run.words[0] ?? null;
  const theme = getThemeStyle(state.run.options.style);
  const finished = solvedCount === state.run.words.length && state.run.words.length > 0;

  const progressLabel = useMemo(() => `${solvedCount}/${state.run.words.length} solved`, [solvedCount, state.run.words.length]);

  function updateOptions<K extends keyof PuzzleOptions>(key: K, value: PuzzleOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  async function requestPuzzleRun(nextOptions: PuzzleOptions) {
    const params = new URLSearchParams({
      mode: nextOptions.mode,
      challenge: nextOptions.challenge,
      topics: nextOptions.topics.join(","),
      puzzleSize: String(nextOptions.puzzleSize),
      style: nextOptions.style,
      clueDensity: String(nextOptions.clueDensity),
      timerEnabled: String(nextOptions.timerEnabled),
      seed: nextOptions.seed,
    });

    const response = await fetch(`/api/puzzle?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Puzzle request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { run: PersistedRunState["run"] };
    return payload.run;
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
    setIsStarting(true);
    setRunError(null);

    try {
      const run = await requestPuzzleRun(normalized);

      startTransition(() => {
        setOptions(run.options);
        setState(createStateFromRun(run));
        setReviewMode("none");
      });
    } catch {
      setRunError("Could not start a new server-backed run. The local generator is still available after refresh.");
    } finally {
      setIsStarting(false);
    }
  }

  async function restartRun() {
    await startNewRun(state.run.options);
  }

  function togglePause() {
    setState((current) => ({
      ...current,
      paused: !current.paused,
    }));
  }

  function revealHint(wordId: string) {
    setState((current) => ({
      ...current,
      hintLevels: {
        ...current.hintLevels,
        [wordId]: Math.min(3, getHintLevel(wordId, current.hintLevels) + 1),
      },
    }));
  }

  function updateGuess(word: PuzzleWord, value: string) {
    setState((current) => {
      const nextGuesses = { ...current.guesses, [word.id]: value };
      const nextSolvedIds = current.solvedIds.includes(word.id)
        ? current.solvedIds
        : isSolved(word, value)
          ? [...current.solvedIds, word.id]
          : current.solvedIds;

      const nextActive = current.run.words.find((entry) => !nextSolvedIds.includes(entry.id))?.id ?? word.id;

      return {
        ...current,
        guesses: nextGuesses,
        solvedIds: nextSolvedIds,
        activeWordId: nextActive,
      };
    });
  }

  return (
    <main className={`scroll-shell ${theme.className} min-h-screen px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="glass-card overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="accent-chip inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
                Astra Lexa
              </span>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Creative English word runs built for replay.</h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Topic-aware puzzle selection, visual clue cards, optional tips, pause and resume, word or full-puzzle review, and switchable styles. The engine is split so the word bank, generator, and UI can scale independently.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                {theme.greekConstellation.map((item) => (
                  <span key={item} className="accent-chip rounded-full px-3 py-1 font-medium capitalize">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid gap-3 text-sm text-slate-200 sm:grid-cols-3 lg:min-w-[24rem]">
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Lexicon</div>
                <div className="mt-2 text-2xl font-semibold text-white">{lexiconSize}</div>
                <div className="mt-1 text-xs text-slate-400">Themed and bridge words ready for weighted selection</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Run State</div>
                <div className="mt-2 text-2xl font-semibold text-white">Pause</div>
                <div className="mt-1 text-xs text-slate-400">Resume, restart, review one word, or inspect the full board</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Style</div>
                <div className="mt-2 text-2xl font-semibold text-white">4 modes</div>
                <div className="mt-1 text-xs text-slate-400">Theme shells can expand without touching the puzzle engine</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[23rem_minmax(0,1fr)]">
          <aside className="glass-card rounded-[2rem] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Run Builder</h2>
                <p className="mt-1 text-sm text-slate-400">Tune difficulty, topic lane, clue density, timer, and style.</p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["custom", "daily"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateOptions("mode", mode)}
                      className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.mode === mode ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200 hover:border-white/20"}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Challenge</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["breeze", "quest", "mythic"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateOptions("challenge", level)}
                      className={`rounded-2xl border px-3 py-2 text-sm capitalize transition ${options.challenge === level ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200 hover:border-white/20"}`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Topics</label>
                <div className="flex flex-wrap gap-2">
                  {topicCatalog.map((topic) => {
                    const active = options.topics.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "accent-chip" : "border-white/10 bg-white/4 text-slate-200 hover:border-white/20"}`}
                      >
                        {topic.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Puzzle Size</span>
                  <input
                    type="range"
                    min={4}
                    max={12}
                    value={options.puzzleSize}
                    onChange={(event) => updateOptions("puzzleSize", Number(event.target.value))}
                    className="w-full"
                  />
                  <span>{options.puzzleSize} words</span>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Clue Density</span>
                  <select
                    value={options.clueDensity}
                    onChange={(event) => updateOptions("clueDensity", Number(event.target.value) as 1 | 2 | 3)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    <option value={1}>Lean</option>
                    <option value={2}>Balanced</option>
                    <option value={3}>Rich</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Style</span>
                  <select
                    value={options.style}
                    onChange={(event) => updateOptions("style", event.target.value as PuzzleOptions["style"])}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none"
                  >
                    {themeStyles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={options.timerEnabled}
                    onChange={(event) => updateOptions("timerEnabled", event.target.checked)}
                    className="size-4 rounded border-white/20 bg-slate-950"
                  />
                  Timer enabled
                </label>

                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{options.mode === "daily" ? "Daily Date" : "Custom Seed"}</span>
                  <input
                    type={options.mode === "daily" ? "date" : "text"}
                    value={options.seed}
                    onChange={(event) => updateOptions("seed", event.target.value)}
                    placeholder={options.mode === "daily" ? getDefaultDailySeed() : "Optional seed for repeatable runs"}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() => startNewRun()}
                disabled={isStarting}
                className="accent-chip w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
              >
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
                    <span className="accent-chip rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">{progressLabel}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{formatElapsed(state.elapsedMs)}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">{state.run.options.mode}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">seed {state.run.seed.replace(/^daily:/, "")}</span>
                  </div>
                  <p className="max-w-4xl text-sm leading-6 text-slate-300">{state.run.blurb}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={togglePause} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    {state.paused ? "Resume" : "Pause"}
                  </button>
                  <button type="button" onClick={restartRun} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Restart
                  </button>
                  <button type="button" onClick={() => setReviewMode("word")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Review Word
                  </button>
                  <button type="button" onClick={() => setReviewMode("puzzle")} className="rounded-full border border-white/10 bg-white/4 px-4 py-2 text-sm text-slate-100">
                    Review Puzzle
                  </button>
                </div>
              </div>
            </div>

            {reviewMode !== "none" ? (
              <div className="glass-card rounded-[2rem] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-white">{reviewMode === "word" ? "Word Review" : "Puzzle Review"}</h3>
                  <button type="button" onClick={() => setReviewMode("none")} className="rounded-full border border-white/10 px-3 py-1 text-sm text-slate-300">
                    Close
                  </button>
                </div>

                {reviewMode === "word" && activeWord ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Current answer</div>
                      <div className="mt-2 text-3xl font-semibold uppercase tracking-[0.16em] text-white">{activeWord.answer}</div>
                      <p className="mt-3 text-sm text-slate-300">{activeWord.prompt}</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Hint ladder</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        {createHintLadder(activeWord).map((hint, index) => (
                          <div key={hint} className="rounded-2xl border border-white/10 px-3 py-2">
                            {index + 1}. {hint}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {reviewMode === "puzzle" ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {state.run.words.map((word) => (
                      <article key={word.id} className="rounded-3xl border border-white/10 bg-white/4 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-lg font-semibold uppercase tracking-[0.14em] text-white">{word.answer}</div>
                          <span className="accent-chip rounded-full px-2.5 py-1 text-[11px] capitalize">{word.difficulty}</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-300">{word.prompt}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {state.run.words.map((word, index) => {
                const solved = state.solvedIds.includes(word.id);
                const hintLevel = getHintLevel(word.id, state.hintLevels);
                const hintLadder = createHintLadder(word);
                const shownHints = hintLadder.slice(0, Math.max(0, hintLevel));
                const canInteract = !state.paused;

                return (
                  <article
                    key={word.id}
                    className={`glass-card rounded-[1.75rem] p-4 transition ${state.activeWordId === word.id ? "accent-ring" : ""} ${solved ? "border-emerald-400/30 bg-emerald-500/8" : ""}`}
                    onClick={() => setState((current) => ({ ...current, activeWordId: word.id }))}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Word {index + 1}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {word.visuals.slice(0, state.run.options.clueDensity + 1).map((visual) => (
                            <span key={visual} className="accent-chip rounded-full px-2.5 py-1 text-[11px] capitalize">
                              {visual}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                        {word.greekMark}
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-slate-300">{word.teaser}</p>

                    <div className="mt-4 rounded-3xl border border-dashed border-white/12 bg-slate-950/30 p-4">
                      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                        <span>{word.length} letters</span>
                        <span>{word.topicLabel}</span>
                      </div>

                      <input
                        value={state.guesses[word.id] ?? ""}
                        onChange={(event) => updateGuess(word, event.target.value)}
                        placeholder={state.paused ? "Paused" : "Type your guess"}
                        disabled={!canInteract || solved}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => revealHint(word.id)}
                        disabled={!canInteract || hintLevel >= 3}
                        className="rounded-full border border-white/10 bg-white/4 px-3 py-1.5 text-xs font-medium text-slate-100 disabled:opacity-40"
                      >
                        {hintLevel >= 3 ? "Hints maxed" : "Get tip"}
                      </button>
                      <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${solved ? "text-emerald-300" : "text-slate-400"}`}>
                        {solved ? "Solved" : "In play"}
                      </span>
                    </div>

                    {shownHints.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {shownHints.map((hint) => (
                          <div key={hint} className="rounded-2xl border border-white/10 bg-white/4 px-3 py-2 text-sm text-slate-200">
                            {hint}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {finished ? (
              <div className="glass-card rounded-[2rem] p-6 text-center">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Run complete</div>
                <h3 className="mt-2 text-3xl font-semibold text-white">Puzzle cleared.</h3>
                <p className="mt-3 text-sm text-slate-300">You can review the full board, restart the same configuration, or tune a new themed run.</p>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
