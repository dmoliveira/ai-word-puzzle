import type { ChallengeLevel, PuzzleMode, PuzzleOptions, PuzzleRun, PuzzleWord, TopicId } from "@/lib/game-types";
import { getThemeStyle } from "@/lib/themes";
import { topicCatalog, wordBank } from "@/lib/word-bank";

const targetLengthRanges: Record<ChallengeLevel, [number, number]> = {
  breeze: [4, 8],
  quest: [5, 10],
  mythic: [6, 14],
};

const challengeOrder: ChallengeLevel[] = ["breeze", "quest", "mythic"];

function clampPuzzleSize(size: number) {
  return Math.max(4, Math.min(12, size));
}

const defaultTopics: TopicId[] = ["myth", "cosmos", "greek"];

function normalizeTopics(topics: TopicId[]) {
  return topics.length > 0 ? topics : defaultTopics;
}

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

  return seed.trim() || `custom:${Date.now()}`;
}

function getEntrySeedScore(entry: PuzzleWord, seed: string, turn: number) {
  const hash = hashString(`${seed}:${entry.id}:${turn}`);
  return (hash % 1000) / 1000;
}

function scoreEntry(entry: PuzzleWord, options: PuzzleOptions, chosen: PuzzleWord[]) {
  const [minLength, maxLength] = targetLengthRanges[options.challenge];
  const inRange = entry.length >= minLength && entry.length <= maxLength ? 4 : 0;
  const exactDifficulty = entry.difficulty === options.challenge ? 8 : 0;
  const nearDifficulty = exactDifficulty === 0 && difficultyDistance(entry.difficulty, options.challenge) === 1 ? 4 : -4;
  const topicBonus = options.topics.includes(entry.topicId) ? 12 : 1;
  const repeatedInitialPenalty = chosen.some((word) => word.answer[0] === entry.answer[0]) ? -3 : 0;
  const repeatedLengthPenalty = chosen.filter((word) => word.length === entry.length).length * -2;
  const suffixPenalty = chosen.some((word) => word.answer.slice(-3) === entry.answer.slice(-3)) ? -3 : 0;
  const topicVarietyBonus = chosen.every((word) => word.topicId !== entry.topicId) ? 3 : 0;

  return inRange + exactDifficulty + nearDifficulty + topicBonus + repeatedInitialPenalty + repeatedLengthPenalty + suffixPenalty + topicVarietyBonus - entry.weight;
}

function buildThemeBlurb(words: PuzzleWord[], options: PuzzleOptions) {
  const theme = getThemeStyle(options.style);
  const topicLabels = [...new Set(words.map((word) => word.topicLabel))].slice(0, 3);
  const tone =
    options.challenge === "breeze"
      ? "a lighter run with fast wins"
      : options.challenge === "quest"
        ? "a balanced trail of layered guesses"
        : "a deeper round with longer reveals";

  const cadence = options.mode === "daily" ? "This daily constellation resets its exact mix each day." : "This custom constellation follows your chosen setup and seed.";

  return `${theme.strapline} Tonight's lane drifts through ${topicLabels.join(", ")} for ${tone}. ${cadence} The scene points the way, but the exact words stay hidden until you earn them.`;
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

export function buildPuzzleRun(input: Partial<PuzzleOptions> = {}): PuzzleRun {
  const options: PuzzleOptions = {
    mode: input.mode ?? "custom",
    challenge: input.challenge ?? "quest",
    topics: normalizeTopics(input.topics ?? defaultTopics),
    puzzleSize: clampPuzzleSize(input.puzzleSize ?? 7),
    style: input.style ?? "alpha",
    clueDensity: input.clueDensity ?? 2,
    timerEnabled: input.timerEnabled ?? true,
    seed: input.seed ?? "",
  };

  if (options.mode === "daily") {
    options.seed = getDailySeedValue(options.seed);
  }

  const resolvedSeed = resolveModeSeed(options.mode, options.seed);

  const topicSet = new Set(options.topics);
  const candidates = wordBank.filter((entry) => {
    if (topicSet.has(entry.topicId)) {
      return true;
    }

    if (entry.topicLabel === "General English") {
      return difficultyDistance(entry.difficulty, options.challenge) <= 1;
    }

    return false;
  });

  const chosen: PuzzleWord[] = [];
  const used = new Set<string>();

  while (chosen.length < options.puzzleSize) {
    const ranked = candidates
      .filter((entry) => !used.has(entry.id))
      .map((entry) => ({ entry, score: scoreEntry(entry, options, chosen) + getEntrySeedScore(entry, resolvedSeed, chosen.length) }))
      .sort((left, right) => right.score - left.score || left.entry.answer.localeCompare(right.entry.answer));

    const pickWindow = Math.min(6, ranked.length);
    const pickIndex = pickWindow > 0 ? hashString(`${resolvedSeed}:pick:${chosen.length}`) % pickWindow : 0;

    const next = ranked[pickIndex]?.entry ?? ranked[0]?.entry;
    if (!next) {
      break;
    }

    chosen.push(next);
    used.add(next.id);
  }

  const theme = getThemeStyle(options.style);
  const labelTopic = topicCatalog.find((topic) => topic.id === options.topics[0])?.label ?? "Word Puzzle";

  return {
    id: `${hashString(`${resolvedSeed}:${options.challenge}:${options.topics.join(",")}:${options.puzzleSize}`)}`,
    createdAt: new Date().toISOString(),
    seed: resolvedSeed,
    options,
    title: `${theme.label} / ${labelTopic}`,
    blurb: buildThemeBlurb(chosen, options),
    words: chosen,
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
