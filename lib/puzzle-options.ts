import type {
  BoardView,
  ChallengeLevel,
  ContentPackId,
  PuzzleFamily,
  PuzzleMode,
  PuzzleOptions,
  ThemeStyleId,
  TopicId,
} from "@/lib/game-types";

const modes = ["custom", "daily"] as const satisfies readonly PuzzleMode[];
const challenges = ["breeze", "quest", "mythic"] as const satisfies readonly ChallengeLevel[];
const families = ["classic", "mini", "themed"] as const satisfies readonly PuzzleFamily[];
const boardViews = ["crossword", "quest"] as const satisfies readonly BoardView[];
const styles = ["alpha", "nebula", "sunforge", "arcade", "classic"] as const satisfies readonly ThemeStyleId[];
const topicIds = [
  "myth", "cosmos", "ocean", "garden", "city", "music", "kitchen", "wild", "weather", "desert",
  "festival", "winter", "invent", "story", "greek",
] as const satisfies readonly TopicId[];
const contentPackIds = [
  "myth-beings", "myth-relics", "cosmos-flight", "cosmos-phenomena", "ocean-life", "ocean-sailing",
  "garden-blooms", "garden-growers", "city-transit", "city-night", "music-stage", "music-instruments",
  "kitchen-pantry", "kitchen-bakes", "wild-creatures", "wild-landforms", "weather-storms", "weather-skies",
  "desert-survival", "desert-stones", "festival-parade", "festival-performance", "winter-weather", "winter-cozy",
  "invent-workshop", "invent-power", "story-books", "story-plot", "greek-symbols", "greek-scholar",
] as const satisfies readonly ContentPackId[];

const sharedOptionKeys = [
  "mode",
  "seed",
  "topics",
  "challenge",
  "puzzleFamily",
  "contentPackId",
  "boardView",
  "style",
  "puzzleSize",
  "clueDensity",
  "timerEnabled",
  "learningMode",
] as const;

export type SharedOptionsResult =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "valid"; options: PuzzleOptions };

function includesValue<T extends string>(values: readonly T[], value: string | null): value is T {
  return value !== null && values.includes(value as T);
}

function parseBoolean(value: string | null) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function isUtcDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getUtcDay(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function clampPuzzleSize(size: number, family: PuzzleFamily) {
  return family === "mini" ? Math.max(4, Math.min(6, size)) : Math.max(4, Math.min(12, size));
}

export function getCanonicalDailyOptions(nowMs = Date.now()): PuzzleOptions {
  return {
    mode: "daily",
    challenge: "quest",
    puzzleFamily: "classic",
    topics: ["myth", "cosmos", "greek"],
    contentPackId: "auto",
    puzzleSize: 7,
    boardView: "crossword",
    style: "alpha",
    clueDensity: 2,
    timerEnabled: true,
    learningMode: false,
    seed: getUtcDay(nowMs),
  };
}

export function normalizePuzzleOptions(input: Partial<PuzzleOptions> = {}, nowMs = Date.now()): PuzzleOptions {
  const defaults = getCanonicalDailyOptions(nowMs);
  const puzzleFamily = families.includes(input.puzzleFamily as PuzzleFamily) ? input.puzzleFamily! : defaults.puzzleFamily;
  const topics = [...new Set((input.topics ?? defaults.topics).filter((topic): topic is TopicId => topicIds.includes(topic as TopicId)))];
  const mode = modes.includes(input.mode as PuzzleMode) ? input.mode! : defaults.mode;
  const rawSeed = typeof input.seed === "string" ? input.seed.trim() : "";

  return {
    mode,
    challenge: challenges.includes(input.challenge as ChallengeLevel) ? input.challenge! : defaults.challenge,
    puzzleFamily,
    topics: topics.length > 0 ? topics : defaults.topics,
    contentPackId: input.contentPackId === "auto" || contentPackIds.includes(input.contentPackId as ContentPackId)
      ? input.contentPackId!
      : defaults.contentPackId,
    puzzleSize: clampPuzzleSize(Number.isFinite(input.puzzleSize) ? Math.trunc(input.puzzleSize!) : defaults.puzzleSize, puzzleFamily),
    boardView: boardViews.includes(input.boardView as BoardView) ? input.boardView! : defaults.boardView,
    style: styles.includes(input.style as ThemeStyleId) ? input.style! : defaults.style,
    clueDensity: input.clueDensity === 1 || input.clueDensity === 2 || input.clueDensity === 3 ? input.clueDensity : defaults.clueDensity,
    timerEnabled: typeof input.timerEnabled === "boolean" ? input.timerEnabled : defaults.timerEnabled,
    learningMode: typeof input.learningMode === "boolean" ? input.learningMode : defaults.learningMode,
    seed: rawSeed || (mode === "daily" ? getUtcDay(nowMs) : ""),
  };
}

export function parseSharedOptions(search: string, nowMs = Date.now()): SharedOptionsResult {
  const params = new URLSearchParams(search);
  const presentKeys = sharedOptionKeys.filter((key) => params.has(key));
  if (presentKeys.length === 0) {
    return { kind: "none" };
  }

  const duplicatedKey = presentKeys.find((key) => params.getAll(key).length !== 1);
  if (duplicatedKey) {
    return { kind: "invalid", reason: `Duplicate ${duplicatedKey} parameter.` };
  }

  const modeValue = params.get("mode");
  const challengeValue = params.get("challenge");
  const familyValue = params.get("puzzleFamily");
  const boardViewValue = params.get("boardView");
  const styleValue = params.get("style");
  const packValue = params.get("contentPackId");
  const mode = modeValue === null ? "custom" : includesValue(modes, modeValue) ? modeValue : null;
  const challenge = challengeValue === null ? undefined : includesValue(challenges, challengeValue) ? challengeValue : null;
  const puzzleFamily = familyValue === null ? undefined : includesValue(families, familyValue) ? familyValue : null;
  const boardView = boardViewValue === null ? undefined : includesValue(boardViews, boardViewValue) ? boardViewValue : null;
  const style = styleValue === null ? undefined : includesValue(styles, styleValue) ? styleValue : null;
  const contentPackId = packValue === null
    ? undefined
    : packValue === "auto" || includesValue(contentPackIds, packValue)
      ? packValue
      : null;

  if (!mode || challenge === null || puzzleFamily === null || boardView === null || style === null || contentPackId === null) {
    return { kind: "invalid", reason: "A shared option is not supported." };
  }

  const topicsValue = params.get("topics");
  const topics = topicsValue === null ? undefined : [...new Set(topicsValue.split(",").filter(Boolean))];
  if (topics && (topics.length === 0 || topics.some((topic) => !includesValue(topicIds, topic)))) {
    return { kind: "invalid", reason: "A shared topic is not supported." };
  }

  const seed = (params.get("seed") ?? "").trim();
  if (seed.length > 80 || (mode === "daily" && seed !== "" && !isUtcDay(seed))) {
    return { kind: "invalid", reason: "The shared seed is invalid." };
  }

  const sizeValue = params.get("puzzleSize");
  const puzzleSize = sizeValue === null ? undefined : Number(sizeValue);
  const resolvedFamily = puzzleFamily ?? "classic";
  const maximumSize = resolvedFamily === "mini" ? 6 : 12;
  if (puzzleSize !== undefined && (!Number.isInteger(puzzleSize) || puzzleSize < 4 || puzzleSize > maximumSize)) {
    return { kind: "invalid", reason: "The shared puzzle size is invalid." };
  }

  const densityValue = params.get("clueDensity");
  const clueDensity = densityValue === null ? undefined : Number(densityValue);
  if (clueDensity !== undefined && clueDensity !== 1 && clueDensity !== 2 && clueDensity !== 3) {
    return { kind: "invalid", reason: "The shared clue density is invalid." };
  }

  const timerValue = params.get("timerEnabled");
  const learningValue = params.get("learningMode");
  const timerEnabled = timerValue === null ? undefined : parseBoolean(timerValue);
  const learningMode = learningValue === null ? undefined : parseBoolean(learningValue);
  if (timerEnabled === null || learningMode === null) {
    return { kind: "invalid", reason: "A shared boolean option is invalid." };
  }

  return {
    kind: "valid",
    options: normalizePuzzleOptions({
      mode,
      seed,
      challenge,
      puzzleFamily,
      contentPackId: contentPackId as ContentPackId | "auto" | undefined,
      boardView,
      style,
      puzzleSize,
      clueDensity: clueDensity as 1 | 2 | 3 | undefined,
      timerEnabled,
      learningMode,
      topics: topics as TopicId[] | undefined,
    }, nowMs),
  };
}
