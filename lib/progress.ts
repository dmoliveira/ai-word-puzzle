import type { AssistSummary, PersistedRunState, ProgressSnapshot, PuzzleOptions, RunSummary } from "@/lib/game-types";
import { isCanonicalDailyOptions, normalizePuzzleOptions } from "@/lib/puzzle-options";
import { summarizeAssists } from "@/lib/run-state";

export const legacyProgressStorageKey = "astra-lexa-progress";

export function createEmptyProgress(): ProgressSnapshot {
  return {
    schemaVersion: 2,
    streak: 0,
    bestStreak: 0,
    lastDailySeed: null,
    lastCompletedAt: null,
    history: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function createEmptyAssistSummary(): AssistSummary {
  return {
    total: 0,
    hintSteps: 0,
    revealedLetters: 0,
    anagrams: 0,
    revealedWords: 0,
    puzzleRevealed: false,
  };
}

function decodeAssistSummary(value: unknown): AssistSummary {
  if (!isObject(value)) {
    return createEmptyAssistSummary();
  }

  const readCount = (key: string) => typeof value[key] === "number" && Number.isInteger(value[key]) && (value[key] as number) >= 0
    ? value[key] as number
    : 0;
  const hintSteps = readCount("hintSteps");
  const revealedLetters = readCount("revealedLetters");
  const anagrams = readCount("anagrams");
  const revealedWords = readCount("revealedWords");
  const puzzleRevealed = value.puzzleRevealed === true;
  const total = hintSteps + revealedLetters + anagrams + revealedWords + (puzzleRevealed ? 1 : 0);
  return { total, hintSteps, revealedLetters, anagrams, revealedWords, puzzleRevealed };
}

function decodeRunSummary(value: unknown): RunSummary | null {
  if (!isObject(value)) {
    return null;
  }

  const runId = typeof value.runId === "string" ? value.runId : null;
  const title = typeof value.title === "string" ? value.title : null;
  const seed = typeof value.seed === "string" ? value.seed : null;
  const createdAt = isIsoTimestamp(value.createdAt) ? value.createdAt : null;
  const completedAt = value.completedAt === null || value.completedAt === undefined
    ? null
    : isIsoTimestamp(value.completedAt)
      ? value.completedAt
      : undefined;
  const solvedCount = typeof value.solvedCount === "number" && Number.isInteger(value.solvedCount) && value.solvedCount >= 0
    ? value.solvedCount
    : null;
  const totalWords = typeof value.totalWords === "number" && Number.isInteger(value.totalWords) && value.totalWords > 0
    ? value.totalWords
    : null;

  if (!runId || !title || seed === null || !createdAt || completedAt === undefined || solvedCount === null || totalWords === null || solvedCount > totalWords || !isObject(value.options)) {
    return null;
  }

  const options = normalizePuzzleOptions(value.options as Partial<PuzzleOptions>, Date.parse(createdAt));
  const finished = value.finished === true && solvedCount === totalWords;
  const attemptId = typeof value.attemptId === "string" && value.attemptId ? value.attemptId : `legacy-${runId}-${createdAt}`;
  const puzzleId = typeof value.puzzleId === "string" && value.puzzleId ? value.puzzleId : runId;
  const dailySeed = seed.replace(/^daily:/, "");
  const canonicalDaily = options.mode === "daily"
    && isCanonicalDailyOptions(options, seed)
    && createdAt.slice(0, 10) === dailySeed
    && (!finished || completedAt?.slice(0, 10) === dailySeed);
  const elapsedMs = typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
    ? Math.floor(value.elapsedMs)
    : 0;

  return {
    attemptId,
    puzzleId,
    runId,
    title,
    seed,
    options,
    mode: options.mode,
    challenge: options.challenge,
    style: options.style,
    solvedCount,
    totalWords,
    finished,
    canonicalDaily,
    elapsedMs,
    assists: decodeAssistSummary(value.assists),
    createdAt,
    completedAt: finished ? completedAt : null,
  };
}

export function decodeProgressSnapshot(value: unknown): ProgressSnapshot | null {
  if (!isObject(value)) {
    return null;
  }

  const history = Array.isArray(value.history)
    ? value.history.map(decodeRunSummary).filter((entry): entry is RunSummary => entry !== null).slice(0, 30)
    : [];
  const streak = typeof value.streak === "number" && Number.isInteger(value.streak) && value.streak >= 0 ? value.streak : 0;
  const bestStreak = typeof value.bestStreak === "number" && Number.isInteger(value.bestStreak) && value.bestStreak >= streak
    ? value.bestStreak
    : streak;
  const lastDailySeed = value.lastDailySeed === null || typeof value.lastDailySeed === "string" ? value.lastDailySeed : null;
  const lastCompletedAt = value.lastCompletedAt === null || isIsoTimestamp(value.lastCompletedAt) ? value.lastCompletedAt : null;

  return {
    schemaVersion: 2,
    streak,
    bestStreak,
    lastDailySeed,
    lastCompletedAt,
    history,
  };
}

export function readLegacyProgress(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(legacyProgressStorageKey);
    return raw ? decodeProgressSnapshot(JSON.parse(raw)) ?? createEmptyProgress() : createEmptyProgress();
  } catch {
    return createEmptyProgress();
  }
}

function buildRunSummary(state: PersistedRunState, existing?: RunSummary): RunSummary {
  const finished = state.completedAt !== null;
  const dailySeed = state.run.seed.replace(/^daily:/, "");
  const canonicalDaily = isCanonicalDailyOptions(state.run.options, state.run.seed)
    && state.startedAt.slice(0, 10) === dailySeed
    && (!finished || state.completedAt?.slice(0, 10) === dailySeed);

  return {
    attemptId: state.attemptId,
    puzzleId: state.run.puzzleId,
    runId: state.run.id,
    title: state.run.title,
    seed: state.run.seed,
    options: state.run.options,
    mode: state.run.options.mode,
    challenge: state.run.options.challenge,
    style: state.run.options.style,
    solvedCount: state.solvedIds.length,
    totalWords: state.run.words.length,
    finished,
    canonicalDaily,
    elapsedMs: state.elapsedMs,
    assists: summarizeAssists(state),
    createdAt: state.startedAt,
    completedAt: state.completedAt ?? existing?.completedAt ?? null,
  };
}

function getDayDistance(left: string, right: string) {
  return (new Date(`${left}T00:00:00Z`).getTime() - new Date(`${right}T00:00:00Z`).getTime()) / 86400000;
}

function calculateStreaks(history: RunSummary[], nowMs: number) {
  const summariesByDay = new Map<string, RunSummary>();
  for (const summary of history) {
    if (!summary.finished || !summary.canonicalDaily || !summary.completedAt) {
      continue;
    }

    const day = summary.seed.replace(/^daily:/, "");
    const current = summariesByDay.get(day);
    if (!current || summary.completedAt > (current.completedAt ?? "")) {
      summariesByDay.set(day, summary);
    }
  }

  const days = [...summariesByDay.keys()].sort();
  let bestStreak = 0;
  let sequence = 0;
  for (let index = 0; index < days.length; index += 1) {
    sequence = index > 0 && getDayDistance(days[index], days[index - 1]) === 1 ? sequence + 1 : 1;
    bestStreak = Math.max(bestStreak, sequence);
  }

  const latestDay = days.at(-1) ?? null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  let streak = 0;
  if (latestDay && getDayDistance(today, latestDay) >= 0 && getDayDistance(today, latestDay) <= 1) {
    streak = 1;
    for (let index = days.length - 1; index > 0; index -= 1) {
      if (getDayDistance(days[index], days[index - 1]) !== 1) {
        break;
      }
      streak += 1;
    }
  }

  const latestSummary = latestDay ? summariesByDay.get(latestDay) ?? null : null;
  return {
    streak,
    bestStreak,
    lastDailySeed: latestDay,
    lastCompletedAt: latestSummary?.completedAt ?? null,
  };
}

export function recordRunProgress(snapshot: ProgressSnapshot, state: PersistedRunState, nowMs = Date.now()) {
  const existing = snapshot.history.find((entry) => entry.attemptId === state.attemptId);
  const summary = buildRunSummary(state, existing);
  const history = [summary, ...snapshot.history.filter((entry) => entry.attemptId !== summary.attemptId)].slice(0, 30);
  const nextSnapshot: ProgressSnapshot = {
    ...snapshot,
    schemaVersion: 2,
    history,
  };
  const streaks = calculateStreaks(history, nowMs);

  return {
    ...nextSnapshot,
    ...streaks,
    bestStreak: Math.max(snapshot.bestStreak, streaks.bestStreak),
  };
}

export function buildDailyArchive(history: RunSummary[], days: number, nowMs = Date.now()) {
  const archive = [] as { day: string; summary: RunSummary | null }[];
  const lookup = new Map<string, RunSummary>();

  for (const entry of history) {
    if (entry.mode !== "daily" || !entry.canonicalDaily) {
      continue;
    }

    const day = entry.seed.replace(/^daily:/, "");
    const current = lookup.get(day);
    if (!current || (!current.finished && entry.finished)) {
      lookup.set(day, entry);
    }
  }

  for (let index = 0; index < days; index += 1) {
    const date = new Date(nowMs);
    date.setUTCDate(date.getUTCDate() - index);
    const day = date.toISOString().slice(0, 10);
    archive.push({ day, summary: lookup.get(day) ?? null });
  }

  return archive;
}
