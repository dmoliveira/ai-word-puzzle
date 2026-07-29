import type { AssistSummary, DailyLedgerOutcome, PersistedRunState, ProgressSnapshot, PuzzleOptions, RunSummary } from "@/lib/game-types";
import { isCanonicalDailyOptions, normalizePuzzleOptions } from "@/lib/puzzle-options";
import { summarizeAssists } from "@/lib/run-state";

export const legacyProgressStorageKey = "astra-lexa-progress";

export function createEmptyProgress(): ProgressSnapshot {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isUtcDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function getDailyOutcome(options: PuzzleOptions, seed: string, startedAt: string, completedAt: string | null, finished: boolean): DailyLedgerOutcome | null {
  if (!isCanonicalDailyOptions(options, seed)) return null;
  if (!finished) return "started";
  const day = seed.replace(/^daily:/, "");
  return startedAt.slice(0, 10) === day && completedAt?.slice(0, 10) === day ? "credited" : "late-clear";
}

const outcomeRank: Record<DailyLedgerOutcome, number> = { started: 0, "late-clear": 1, credited: 2 };

function mergeDailyOutcome(current: DailyLedgerOutcome | undefined, candidate: DailyLedgerOutcome) {
  return !current || outcomeRank[candidate] > outcomeRank[current] ? candidate : current;
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
  const normalizedCompletedAt = finished ? completedAt : null;
  const dailyOutcome = getDailyOutcome(options, seed, createdAt, normalizedCompletedAt, finished);
  const canonicalDaily = dailyOutcome !== null;
  const elapsedMs = typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
    ? Math.floor(value.elapsedMs)
    : 0;
  const generatorVersion = typeof value.generatorVersion === "number" && Number.isInteger(value.generatorVersion) && value.generatorVersion > 0
    ? value.generatorVersion
    : 3;
  const hasProvenance = typeof value.corpusRevision === "string" && value.corpusRevision.length > 0
    && value.fingerprintVersion === 1 && typeof value.puzzleFingerprint === "string" && /^p1-[a-f0-9]{64}$/.test(value.puzzleFingerprint);

  const summary: RunSummary = {
    attemptId,
    puzzleId,
    generatorVersion,
    corpusRevision: hasProvenance ? value.corpusRevision as string : null,
    fingerprintVersion: hasProvenance ? 1 : null,
    puzzleFingerprint: hasProvenance ? value.puzzleFingerprint as string : null,
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
    dailyOutcome,
    elapsedMs,
    assists: decodeAssistSummary(value.assists),
    createdAt,
    completedAt: normalizedCompletedAt,
  };
  return summary;
}

export function decodeProgressSnapshot(value: unknown): ProgressSnapshot | null {
  if (!isObject(value) || (typeof value.schemaVersion === "number" && value.schemaVersion > 3)) {
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
  if (lastDailySeed !== null && !isUtcDay(lastDailySeed)) return null;
  const dailyLedger: Record<string, DailyLedgerOutcome> = {};
  if (value.schemaVersion === 3) {
    if (!isObject(value.dailyLedger)) return null;
    for (const [day, outcome] of Object.entries(value.dailyLedger)) {
      if (!isUtcDay(day) || !["started", "late-clear", "credited"].includes(outcome as string)) return null;
      dailyLedger[day] = outcome as DailyLedgerOutcome;
    }
  }
  for (const summary of history) {
    if (!summary.dailyOutcome) continue;
    const day = summary.seed.replace(/^daily:/, "");
    if (!isUtcDay(day)) continue;
    dailyLedger[day] = mergeDailyOutcome(dailyLedger[day], summary.dailyOutcome);
  }
  return {
    schemaVersion: 3,
    streak,
    bestStreak,
    lastDailySeed,
    lastCompletedAt,
    dailyLedger,
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
  const completedAt = state.completedAt ?? existing?.completedAt ?? null;
  const dailyOutcome = getDailyOutcome(state.run.options, state.run.seed, state.startedAt, completedAt, finished);

  const summary: RunSummary = {
    attemptId: state.attemptId,
    puzzleId: state.run.puzzleId,
    generatorVersion: state.run.generatorVersion,
    corpusRevision: state.run.corpusRevision,
    fingerprintVersion: state.run.fingerprintVersion,
    puzzleFingerprint: state.run.puzzleFingerprint,
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
    canonicalDaily: dailyOutcome !== null,
    dailyOutcome,
    elapsedMs: state.elapsedMs,
    assists: summarizeAssists(state),
    createdAt: state.startedAt,
    completedAt,
  };
  return summary;
}

function getDayDistance(left: string, right: string) {
  return (new Date(`${left}T00:00:00Z`).getTime() - new Date(`${right}T00:00:00Z`).getTime()) / 86400000;
}

function calculateStreaks(dailyLedger: Readonly<Record<string, DailyLedgerOutcome>>, nowMs: number) {
  const days = Object.entries(dailyLedger)
    .filter(([, outcome]) => outcome === "credited")
    .map(([day]) => day)
    .sort();
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

  return {
    streak,
    bestStreak,
    lastDailySeed: latestDay,
  };
}

export function recordRunProgress(snapshot: ProgressSnapshot, state: PersistedRunState, nowMs = Date.now()) {
  const existing = snapshot.history.find((entry) => entry.attemptId === state.attemptId);
  const summary = buildRunSummary(state, existing);
  const history = [summary, ...snapshot.history.filter((entry) => entry.attemptId !== summary.attemptId)].slice(0, 30);
  const dailyLedger = { ...snapshot.dailyLedger };
  if (summary.dailyOutcome) {
    const day = summary.seed.replace(/^daily:/, "");
    dailyLedger[day] = mergeDailyOutcome(dailyLedger[day], summary.dailyOutcome);
  }
  const nextSnapshot: ProgressSnapshot = {
    ...snapshot,
    schemaVersion: 3,
    dailyLedger,
    history,
  };
  const streaks = calculateStreaks(dailyLedger, nowMs);
  const latestCredited = streaks.lastDailySeed
    ? history.find((entry) => entry.dailyOutcome === "credited" && entry.seed.replace(/^daily:/, "") === streaks.lastDailySeed && entry.completedAt)
    : null;
  const lastCompletedAt = latestCredited?.completedAt
    ?? (snapshot.lastDailySeed === streaks.lastDailySeed ? snapshot.lastCompletedAt : null);

  return {
    ...nextSnapshot,
    ...streaks,
    lastCompletedAt,
    bestStreak: Math.max(snapshot.bestStreak, streaks.bestStreak),
  };
}

export function buildDailyArchive(snapshot: ProgressSnapshot, days: number, nowMs = Date.now()) {
  const archive = [] as { day: string; outcome: DailyLedgerOutcome | null; summary: RunSummary | null }[];
  const lookup = new Map<string, RunSummary>();

  for (const entry of snapshot.history) {
    if (entry.mode !== "daily" || !entry.canonicalDaily) {
      continue;
    }

    const day = entry.seed.replace(/^daily:/, "");
    const current = lookup.get(day);
    if (!current || outcomeRank[entry.dailyOutcome ?? "started"] > outcomeRank[current.dailyOutcome ?? "started"]
      || (entry.dailyOutcome === current.dailyOutcome && (entry.completedAt ?? "") > (current.completedAt ?? ""))) {
      lookup.set(day, entry);
    }
  }

  for (let index = 0; index < days; index += 1) {
    const date = new Date(nowMs);
    date.setUTCDate(date.getUTCDate() - index);
    const day = date.toISOString().slice(0, 10);
    archive.push({ day, outcome: snapshot.dailyLedger[day] ?? null, summary: lookup.get(day) ?? null });
  }

  return archive;
}
