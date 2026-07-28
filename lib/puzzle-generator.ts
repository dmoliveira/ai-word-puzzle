import type {
  ChallengeLevel,
  ContentPack,
  PuzzleMode,
  PuzzleOptions,
  PuzzleRun,
  PuzzleWord,
  TopicId,
} from "@/lib/game-types";
import { buildConnectedCrossword, buildQuestBoard } from "@/lib/board-generator";
import { isCrosswordContentPack, isCrosswordTopic } from "@/lib/clue-catalog";
import { getPuzzleSizeRange, normalizePuzzleOptions } from "@/lib/puzzle-options";
import { getThemeStyle } from "@/lib/themes";
import { contentCatalog, topicCatalog, wordBank } from "@/lib/word-bank";

const targetLengthRanges: Record<ChallengeLevel, [number, number]> = {
  breeze: [4, 8],
  quest: [5, 10],
  mythic: [6, 14],
};

const miniTargetLengthRanges: Record<ChallengeLevel, [number, number]> = {
  breeze: [3, 6],
  quest: [4, 7],
  mythic: [4, 8],
};

const challengeOrder: ChallengeLevel[] = ["breeze", "quest", "mythic"];

function difficultyDistance(left: ChallengeLevel, right: ChallengeLevel) {
  return Math.abs(challengeOrder.indexOf(left) - challengeOrder.indexOf(right));
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getDailySeedValue(seed: string) {
  return seed || new Date().toISOString().slice(0, 10);
}

function resolveModeSeed(mode: PuzzleMode, seed: string) {
  if (mode === "daily") {
    return `daily:${getDailySeedValue(seed)}`;
  }

  return seed.trim() || "custom:starter";
}

function getEntrySeedScore(entry: PuzzleWord, seed: string, turn: number) {
  const hash = hashString(`${seed}:${entry.id}:${turn}`);
  return (hash % 1000) / 1000;
}

export function scoreDifficultyMatch(entryDifficulty: ChallengeLevel, requestedDifficulty: ChallengeLevel) {
  if (entryDifficulty === requestedDifficulty) {
    return 8;
  }
  return difficultyDistance(entryDifficulty, requestedDifficulty) === 1 ? 4 : -4;
}

function scoreEntry(entry: PuzzleWord, options: PuzzleOptions, chosen: PuzzleWord[], contentPack: ContentPack | null) {
  const [minLength, maxLength] = options.puzzleFamily === "mini" ? miniTargetLengthRanges[options.challenge] : targetLengthRanges[options.challenge];
  const inRange = entry.length >= minLength && entry.length <= maxLength ? 4 : 0;
  const difficultyScore = scoreDifficultyMatch(entry.difficulty, options.challenge);
  const topicBonus = options.topics.includes(entry.topicId) ? 12 : 1;
  const repeatedInitialPenalty = chosen.some((word) => word.answer[0] === entry.answer[0]) ? -3 : 0;
  const repeatedLengthPenalty = chosen.filter((word) => word.length === entry.length).length * -2;
  const suffixPenalty = chosen.some((word) => word.answer.slice(-3) === entry.answer.slice(-3)) ? -3 : 0;
  const topicVarietyBonus = chosen.every((word) => word.topicId !== entry.topicId) ? 3 : 0;
  const familyBonus = options.puzzleFamily === "mini"
    ? entry.length <= maxLength ? 6 : -10
    : options.puzzleFamily === "themed" && contentPack && entry.contentPackIds.includes(contentPack.id)
      ? 8
      : 0;
  const featuredPackBonus = options.puzzleFamily !== "themed" && contentPack && entry.contentPackIds.includes(contentPack.id)
    ? chosen.some((word) => word.contentPackIds.includes(contentPack.id))
      ? 2
      : 5
    : 0;

  const frequencyBonus = entry.frequencyBand === "common" ? 2 : entry.frequencyBand === "uncommon" ? 1 : -1;
  const rareCount = chosen.filter((word) => word.frequencyBand === "rare").length;
  const uncommonCount = chosen.filter((word) => word.frequencyBand === "uncommon").length;
  const fairnessPenalty =
    options.challenge === "breeze"
      ? entry.frequencyBand === "rare"
        ? -24
        : entry.frequencyBand === "uncommon" && uncommonCount >= Math.max(1, Math.floor(options.puzzleSize / 3))
          ? -6
          : 0
      : options.challenge === "quest"
        ? entry.frequencyBand === "rare" && rareCount >= 1
          ? -12
          : entry.frequencyBand === "uncommon" && uncommonCount >= Math.ceil(options.puzzleSize / 2)
            ? -4
            : 0
        : 0;

  return inRange + difficultyScore + topicBonus + repeatedInitialPenalty + repeatedLengthPenalty + suffixPenalty + topicVarietyBonus + frequencyBonus + fairnessPenalty + familyBonus + featuredPackBonus - entry.weight;
}

function isEligibleEntry(entry: PuzzleWord, options: PuzzleOptions, contentPack: ContentPack | null) {
  if (entry.length > 14 || !options.topics.includes(entry.topicId)) {
    return false;
  }

  if (options.boardView === "crossword" && (entry.qualityStatus !== "approved" || !entry.clue)) {
    return false;
  }

  return contentPack
    ? entry.topicId === contentPack.topicId && entry.contentPackIds.includes(contentPack.id)
    : true;
}

function countEligibleAnswers(pack: ContentPack, options: PuzzleOptions) {
  return new Set(wordBank.filter((entry) => isEligibleEntry(entry, options, pack)).map((entry) => entry.normalized)).size;
}

function getContentPackCandidates(options: PuzzleOptions, minimumSize = 1) {
  const topics: TopicId[] = options.topics;
  const topicSet = new Set(topics);
  return contentCatalog
    .filter((pack) => topicSet.has(pack.topicId))
    .filter((pack) => countEligibleAnswers(pack, options) >= minimumSize);
}

function resolveContentPack(options: PuzzleOptions, seed: string) {
  if (options.puzzleFamily !== "themed") {
    return null;
  }

  if (options.contentPackId !== "auto") {
    const explicitPack = contentCatalog.find((pack) => pack.id === options.contentPackId) ?? null;
    if (!explicitPack || !options.topics.includes(explicitPack.topicId)) {
      return null;
    }

    const eligibleCount = countEligibleAnswers(explicitPack, options);
    return eligibleCount >= options.puzzleSize ? explicitPack : null;
  }

  const candidates = getContentPackCandidates(options, options.puzzleSize);
  if (candidates.length === 0) {
    return null;
  }

  return candidates[hashString(`${seed}:${options.challenge}:content-pack`) % candidates.length];
}

function resolveFeaturedContentPack(options: PuzzleOptions, seed: string) {
  if (options.puzzleFamily === "themed") {
    return resolveContentPack(options, seed);
  }

  const candidates = getContentPackCandidates(options, Math.min(options.puzzleSize, 4));
  if (candidates.length === 0) {
    return null;
  }

  return candidates[hashString(`${seed}:${options.challenge}:${options.puzzleFamily}:featured-pack`) % candidates.length];
}

function buildThemeBlurb(words: PuzzleWord[], options: PuzzleOptions) {
  const theme = getThemeStyle(options.style);
  const moodDescriptors = [...new Set(words.map((word) => topicCatalog.find((topic) => topic.id === word.topicId)?.mood.toLowerCase() ?? "layered english wordplay"))].slice(0, 2);
  const tone =
    options.challenge === "breeze"
      ? "a lighter run with fast wins"
      : options.challenge === "quest"
        ? "a balanced trail of layered guesses"
        : "a deeper round with longer reveals";

  const cadence = options.mode === "daily" ? "This daily constellation resets its exact mix each day." : "This custom constellation follows your chosen setup and seed.";

  const playContract = options.boardView === "crossword"
    ? "Each answer has an editorial clue, and unsolved words stay hidden until you earn them."
    : "Use the visible target list to trace each hidden path across the letter field.";
  let blurb = `${theme.strapline} Tonight's lane drifts through ${moodDescriptors.join(" and ")} for ${tone}. ${cadence} ${playContract}`;

  for (const word of words) {
    if (word.answer.length < 4) {
      continue;
    }

    blurb = blurb.replace(new RegExp(word.answer, "gi"), "theme");
  }

  return blurb;
}

export function createHintLadder(word: PuzzleWord) {
  const vowelsOnly = word.answer.replace(/[^aeiou]/g, "_");
  return [
    `${word.length} letters`,
    `Starts with ${word.answer[0]?.toUpperCase() ?? "?"}`,
    `Vowel trace: ${vowelsOnly || "_"}`,
    word.answer.toUpperCase(),
  ];
}

export class PuzzleGenerationError extends Error {
  constructor(
    readonly code: "unsupported-content" | "insufficient-words" | "layout-failed",
    message: string,
  ) {
    super(message);
    this.name = "PuzzleGenerationError";
  }
}

export function buildPuzzleRun(input: Partial<PuzzleOptions> = {}): PuzzleRun {
  const requestedBoardView = input.boardView ?? "crossword";
  const requestedFamily = input.puzzleFamily ?? "classic";
  const sizeRange = getPuzzleSizeRange(requestedFamily, requestedBoardView);
  if (input.puzzleSize !== undefined && (!Number.isInteger(input.puzzleSize) || input.puzzleSize < sizeRange.min || input.puzzleSize > sizeRange.max)) {
    throw new PuzzleGenerationError("unsupported-content", `Supported ${requestedBoardView} sizes are ${sizeRange.min}–${sizeRange.max} words for this family.`);
  }
  if (requestedBoardView === "crossword"
    && ((input.topics?.some((topic) => !isCrosswordTopic(topic)) ?? false)
      || (input.contentPackId !== undefined && input.contentPackId !== "auto" && !isCrosswordContentPack(input.contentPackId)))) {
    throw new PuzzleGenerationError("unsupported-content", "That topic or content pack does not yet have editorial crossword clues.");
  }

  const options = normalizePuzzleOptions({
    mode: "custom",
    seed: "",
    ...input,
  });

  if (options.mode === "daily") {
    options.seed = getDailySeedValue(options.seed);
  }

  const resolvedSeed = resolveModeSeed(options.mode, options.seed);
  const resolvedContentPack = resolveContentPack(options, resolvedSeed);
  if (options.puzzleFamily === "themed" && !resolvedContentPack) {
    throw new PuzzleGenerationError("unsupported-content", "That themed pack cannot support the selected puzzle size.");
  }

  const featuredContentPack = resolveFeaturedContentPack(options, resolvedSeed);
  const uniqueAnswers = new Map<string, PuzzleWord>();
  for (const entry of wordBank) {
    if (!isEligibleEntry(entry, options, resolvedContentPack)) {
      continue;
    }

    const existing = uniqueAnswers.get(entry.normalized);
    if (!existing || scoreEntry(entry, options, [], resolvedContentPack) > scoreEntry(existing, options, [], resolvedContentPack)) {
      uniqueAnswers.set(entry.normalized, entry);
    }
  }

  const candidates = [...uniqueAnswers.values()]
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, options, [], resolvedContentPack ?? featuredContentPack) + getEntrySeedScore(entry, resolvedSeed, 0) * 3,
    }))
    .sort((left, right) => right.score - left.score
      || hashString(`${resolvedSeed}:rank:${left.entry.id}`) - hashString(`${resolvedSeed}:rank:${right.entry.id}`)
      || left.entry.answer.localeCompare(right.entry.answer))
    .map(({ entry }) => entry);

  if (candidates.length < options.puzzleSize) {
    throw new PuzzleGenerationError("insufficient-words", "Not enough approved words exist for that puzzle setup.");
  }

  const generated = options.boardView === "quest"
    ? {
        words: candidates.slice(0, options.puzzleSize),
        board: buildQuestBoard(candidates.slice(0, options.puzzleSize), resolvedSeed),
      }
    : buildConnectedCrossword(candidates, options.puzzleSize, resolvedSeed);
  if (!generated || generated.words.length !== options.puzzleSize || generated.board.placements.length !== options.puzzleSize) {
    throw new PuzzleGenerationError("layout-failed", "Could not build a connected puzzle for that setup. Try another seed or topic mix.");
  }

  const placedWords = generated.words;
  const board = generated.board;
  const theme = getThemeStyle(options.style);
  const labelTopic = resolvedContentPack?.label ?? featuredContentPack?.label ?? topicCatalog.find((topic) => topic.id === options.topics[0])?.label ?? "Word Puzzle";
  const identity = [
    "v3",
    resolvedSeed,
    options.challenge,
    options.puzzleFamily,
    options.contentPackId,
    options.topics.join(","),
    options.puzzleSize,
    options.boardView,
    placedWords.map((word) => word.id).join(","),
    board.placements.map((placement) => `${placement.wordId}:${placement.row}:${placement.col}:${placement.direction}`).join("|"),
  ].join(":");
  const puzzleId = `${hashString(identity)}`;

  return {
    id: puzzleId,
    puzzleId,
    generatorVersion: 3,
    createdAt: new Date().toISOString(),
    seed: resolvedSeed,
    options,
    title: `${theme.label} / ${labelTopic}`,
    blurb: buildThemeBlurb(placedWords, options),
    words: placedWords,
    board,
  };
}

export function getDefaultDailySeed() {
  return new Date().toISOString().slice(0, 10);
}

export function sanitizeGuess(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

export function isSolved(word: PuzzleWord, guess: string) {
  return sanitizeGuess(guess) === word.normalized;
}
