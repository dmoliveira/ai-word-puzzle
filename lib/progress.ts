import type { PersistedRunState, ProgressSnapshot, RunSummary } from "@/lib/game-types";

export const progressStorageKey = "astra-lexa-progress";

export function createEmptyProgress(): ProgressSnapshot {
  return {
    streak: 0,
    bestStreak: 0,
    lastDailySeed: null,
    lastCompletedAt: null,
    history: [],
  };
}

export function readProgressSnapshot() {
  if (typeof window === "undefined") {
    return createEmptyProgress();
  }

  try {
    const raw = localStorage.getItem(progressStorageKey);
    if (!raw) {
      return createEmptyProgress();
    }

    return { ...createEmptyProgress(), ...(JSON.parse(raw) as ProgressSnapshot) };
  } catch {
    return createEmptyProgress();
  }
}

export function writeProgressSnapshot(snapshot: ProgressSnapshot) {
  localStorage.setItem(progressStorageKey, JSON.stringify(snapshot));
}

function buildRunSummary(state: PersistedRunState): RunSummary {
  const finished = state.solvedIds.length === state.run.words.length && state.run.words.length > 0;

  return {
    runId: state.run.id,
    title: state.run.title,
    seed: state.run.seed,
    mode: state.run.options.mode,
    challenge: state.run.options.challenge,
    style: state.run.options.style,
    solvedCount: state.solvedIds.length,
    totalWords: state.run.words.length,
    finished,
    createdAt: state.run.createdAt,
    completedAt: finished ? new Date().toISOString() : null,
  };
}

function getDayKey(timestamp: string) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function recordRunProgress(snapshot: ProgressSnapshot, state: PersistedRunState) {
  const summary = buildRunSummary(state);
  const history = [summary, ...snapshot.history.filter((entry) => entry.runId !== summary.runId)].slice(0, 30);
  const nextSnapshot: ProgressSnapshot = {
    ...snapshot,
    history,
  };

  if (!summary.finished || summary.mode !== "daily") {
    return nextSnapshot;
  }

  const dailySeed = summary.seed.replace(/^daily:/, "");
  if (snapshot.lastDailySeed === dailySeed) {
    return {
      ...nextSnapshot,
      lastCompletedAt: summary.completedAt,
    };
  }

  const previousDay = snapshot.lastCompletedAt ? getDayKey(snapshot.lastCompletedAt) : null;
  const currentDay = summary.completedAt ? getDayKey(summary.completedAt) : null;
  const streak = previousDay && currentDay
    ? Math.abs((new Date(`${currentDay}T00:00:00Z`).getTime() - new Date(`${previousDay}T00:00:00Z`).getTime()) / 86400000) <= 1
      ? snapshot.streak + 1
      : 1
    : 1;

  return {
    ...nextSnapshot,
    streak,
    bestStreak: Math.max(snapshot.bestStreak, streak),
    lastDailySeed: dailySeed,
    lastCompletedAt: summary.completedAt,
  };
}

export function buildDailyArchive(history: RunSummary[], days: number) {
  const archive = [] as { day: string; summary: RunSummary | null }[];
  const lookup = new Map(history.filter((entry) => entry.mode === "daily").map((entry) => [entry.seed.replace(/^daily:/, ""), entry]));

  for (let index = 0; index < days; index += 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const day = date.toISOString().slice(0, 10);
    archive.push({ day, summary: lookup.get(day) ?? null });
  }

  return archive;
}
