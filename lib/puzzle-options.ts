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
import { crosswordContentPackIds, crosswordTopicIds } from "@/lib/clue-catalog";

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
  "generatorVersion",
  "mode",
  "seed",
  "topics",
  "challenge",
  "puzzleFamily",
  "contentPackId",
  "boardView",
  "style",
  "puzzleSize",
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

export function getPuzzleSizeRange(family: PuzzleFamily, boardView: BoardView) {
  if (boardView === "quest") {
    return { min: 4, max: family === "mini" ? 6 : 12 };
  }

  return { min: 4, max: family === "mini" ? 5 : family === "themed" ? 6 : 8 };
}

export function clampPuzzleSize(size: number, family: PuzzleFamily, boardView: BoardView) {
  const range = getPuzzleSizeRange(family, boardView);
  return Math.max(range.min, Math.min(range.max, size));
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
    timerEnabled: true,
    learningMode: false,
    seed: getUtcDay(nowMs),
  };
}

export function isCanonicalDailyOptions(options: PuzzleOptions, seed: string) {
  const day = seed.replace(/^daily:/, "");
  if (!isUtcDay(day)) {
    return false;
  }

  const expected = getCanonicalDailyOptions(Date.parse(`${day}T12:00:00.000Z`));
  return options.mode === "daily"
    && options.seed.replace(/^daily:/, "") === day
    && options.challenge === expected.challenge
    && options.puzzleFamily === expected.puzzleFamily
    && options.contentPackId === expected.contentPackId
    && options.puzzleSize === expected.puzzleSize
    && options.boardView === expected.boardView
    && options.topics.length === expected.topics.length
    && options.topics.every((topic, index) => topic === expected.topics[index]);
}

export function normalizePuzzleOptions(input: Partial<PuzzleOptions> = {}, nowMs = Date.now()): PuzzleOptions {
  const defaults = getCanonicalDailyOptions(nowMs);
  const puzzleFamily = families.includes(input.puzzleFamily as PuzzleFamily) ? input.puzzleFamily! : defaults.puzzleFamily;
  const boardView = boardViews.includes(input.boardView as BoardView) ? input.boardView! : defaults.boardView;
  const allowedTopics: readonly TopicId[] = boardView === "crossword" ? crosswordTopicIds : topicIds;
  const topics = [...new Set((input.topics ?? defaults.topics).filter((topic): topic is TopicId => allowedTopics.includes(topic as TopicId)))];
  const mode = modes.includes(input.mode as PuzzleMode) ? input.mode! : defaults.mode;
  const rawSeed = typeof input.seed === "string" ? input.seed.trim() : "";
  const requestedContentPack = input.contentPackId === "auto" || contentPackIds.includes(input.contentPackId as ContentPackId)
    ? input.contentPackId!
    : defaults.contentPackId;
  const contentPackId = puzzleFamily !== "themed"
    || (boardView === "crossword" && requestedContentPack !== "auto" && !crosswordContentPackIds.includes(requestedContentPack as (typeof crosswordContentPackIds)[number]))
    ? "auto"
    : requestedContentPack;

  return {
    mode,
    challenge: challenges.includes(input.challenge as ChallengeLevel) ? input.challenge! : defaults.challenge,
    puzzleFamily,
    topics: topics.length > 0 ? topics : defaults.topics,
    contentPackId,
    puzzleSize: clampPuzzleSize(Number.isFinite(input.puzzleSize) ? Math.trunc(input.puzzleSize!) : defaults.puzzleSize, puzzleFamily, boardView),
    boardView,
    style: styles.includes(input.style as ThemeStyleId) ? input.style! : defaults.style,
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

  const generatorVersion = params.get("generatorVersion");
  if (generatorVersion !== null && generatorVersion !== "3") {
    return { kind: "invalid", reason: "That shared puzzle uses an unsupported generator version." };
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

  const resolvedBoardView = boardView ?? "crossword";
  if (resolvedBoardView === "crossword"
    && ((topics && topics.some((topic) => !crosswordTopicIds.includes(topic as (typeof crosswordTopicIds)[number])))
      || (contentPackId && contentPackId !== "auto" && !crosswordContentPackIds.includes(contentPackId as (typeof crosswordContentPackIds)[number])))) {
    return { kind: "invalid", reason: "That topic or content pack is not available for curated crosswords." };
  }

  const seed = (params.get("seed") ?? "").trim();
  if (seed.length > 80 || (mode === "daily" && seed !== "" && !isUtcDay(seed))) {
    return { kind: "invalid", reason: "The shared seed is invalid." };
  }

  const sizeValue = params.get("puzzleSize");
  const puzzleSize = sizeValue === null ? undefined : Number(sizeValue);
  const resolvedFamily = puzzleFamily ?? "classic";
  const maximumSize = getPuzzleSizeRange(resolvedFamily, resolvedBoardView).max;
  if (puzzleSize !== undefined && (!Number.isInteger(puzzleSize) || puzzleSize < 4 || puzzleSize > maximumSize)) {
    return { kind: "invalid", reason: "The shared puzzle size is invalid." };
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
      timerEnabled,
      learningMode,
      topics: topics as TopicId[] | undefined,
    }, nowMs),
  };
}
