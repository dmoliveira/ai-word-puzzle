import type { PersistedRunState, ProgressSnapshot, PuzzleOptions, RunSummary } from "@/lib/game-types";
import { normalizePuzzleOptions } from "@/lib/puzzle-options";

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
    createdAt: state.startedAt,
    completedAt: state.completedAt ?? existing?.completedAt ?? null,
  };
}

function getDayKey(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function recordRunProgress(snapshot: ProgressSnapshot, state: PersistedRunState) {
  const existing = snapshot.history.find((entry) => entry.attemptId === state.attemptId);
  const summary = buildRunSummary(state, existing);
  const history = [summary, ...snapshot.history.filter((entry) => entry.attemptId !== summary.attemptId)].slice(0, 30);
  const nextSnapshot: ProgressSnapshot = {
    ...snapshot,
    schemaVersion: 2,
    history,
  };

  if (!summary.finished || summary.mode !== "daily" || !summary.completedAt) {
    return nextSnapshot;
  }

  const dailySeed = summary.seed.replace(/^daily:/, "");
  if (snapshot.lastDailySeed === dailySeed) {
    return nextSnapshot;
  }

  const previousDay = snapshot.lastCompletedAt ? getDayKey(snapshot.lastCompletedAt) : null;
  const currentDay = getDayKey(summary.completedAt);
  const dayDistance = previousDay
    ? (new Date(`${currentDay}T00:00:00Z`).getTime() - new Date(`${previousDay}T00:00:00Z`).getTime()) / 86400000
    : null;
  const streak = dayDistance === 1 ? snapshot.streak + 1 : 1;

  return {
    ...nextSnapshot,
    streak,
    bestStreak: Math.max(snapshot.bestStreak, streak),
    lastDailySeed: dailySeed,
    lastCompletedAt: summary.completedAt,
  };
}

export function buildDailyArchive(history: RunSummary[], days: number, nowMs = Date.now()) {
  const archive = [] as { day: string; summary: RunSummary | null }[];
  const lookup = new Map<string, RunSummary>();

  for (const entry of history) {
    if (entry.mode !== "daily") {
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
