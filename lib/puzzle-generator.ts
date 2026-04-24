import type {
  ChallengeLevel,
  PuzzleBoard,
  PuzzleBoardCell,
  PuzzleDirection,
  PuzzleMode,
  PuzzleOptions,
  PuzzlePlacement,
  PuzzleRun,
  PuzzleWord,
  TopicId,
} from "@/lib/game-types";
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

  return seed.trim() || "custom:starter";
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

  return inRange + exactDifficulty + nearDifficulty + topicBonus + repeatedInitialPenalty + repeatedLengthPenalty + suffixPenalty + topicVarietyBonus + frequencyBonus + fairnessPenalty - entry.weight;
}

function getBoardSize(words: PuzzleWord[]) {
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  return Math.max(9, Math.min(17, longest + Math.ceil(words.length / 2) + 2));
}

function createEmptyGrid(size: number) {
  return Array.from({ length: size }, () => Array.from<string | null>({ length: size }).fill(null));
}

function getStep(direction: PuzzleDirection) {
  return direction === "across" ? { row: 0, col: 1 } : { row: 1, col: 0 };
}

function canPlaceWord(grid: (string | null)[][], word: string, row: number, col: number, direction: PuzzleDirection) {
  const size = grid.length;
  const { row: rowStep, col: colStep } = getStep(direction);
  const endRow = row + rowStep * (word.length - 1);
  const endCol = col + colStep * (word.length - 1);

  if (row < 0 || col < 0 || endRow >= size || endCol >= size) {
    return -1;
  }

  const beforeRow = row - rowStep;
  const beforeCol = col - colStep;
  const afterRow = endRow + rowStep;
  const afterCol = endCol + colStep;

  if (beforeRow >= 0 && beforeCol >= 0 && beforeRow < size && beforeCol < size && grid[beforeRow][beforeCol] !== null) {
    return -1;
  }

  if (afterRow >= 0 && afterCol >= 0 && afterRow < size && afterCol < size && grid[afterRow][afterCol] !== null) {
    return -1;
  }

  let intersections = 0;

  for (let index = 0; index < word.length; index += 1) {
    const currentRow = row + rowStep * index;
    const currentCol = col + colStep * index;
    const currentCell = grid[currentRow][currentCol];

    if (currentCell !== null && currentCell !== word[index]) {
      return -1;
    }

    if (currentCell === word[index]) {
      intersections += 1;
      continue;
    }

    if (direction === "across") {
      if ((currentRow > 0 && grid[currentRow - 1][currentCol] !== null) || (currentRow < size - 1 && grid[currentRow + 1][currentCol] !== null)) {
        return -1;
      }
    } else if ((currentCol > 0 && grid[currentRow][currentCol - 1] !== null) || (currentCol < size - 1 && grid[currentRow][currentCol + 1] !== null)) {
      return -1;
    }
  }

  return intersections;
}

function writeWordToGrid(grid: (string | null)[][], word: string, row: number, col: number, direction: PuzzleDirection) {
  const { row: rowStep, col: colStep } = getStep(direction);

  for (let index = 0; index < word.length; index += 1) {
    grid[row + rowStep * index][col + colStep * index] = word[index];
  }
}

function buildPuzzleBoard(words: PuzzleWord[]): PuzzleBoard {
  const orderedWords = [...words].sort((left, right) => right.length - left.length || left.answer.localeCompare(right.answer));
  const size = getBoardSize(orderedWords);
  const grid = createEmptyGrid(size);
  const placements: Omit<PuzzlePlacement, "clueNumber">[] = [];
  const centerRow = Math.floor(size / 2);
  const firstWord = orderedWords[0];

  writeWordToGrid(grid, firstWord.answer, centerRow, Math.max(0, Math.floor((size - firstWord.length) / 2)), "across");
  placements.push({ wordId: firstWord.id, row: centerRow, col: Math.max(0, Math.floor((size - firstWord.length) / 2)), direction: "across" });

  for (const word of orderedWords.slice(1)) {
    let bestPlacement: Omit<PuzzlePlacement, "clueNumber"> | null = null;
    let bestScore = -1;

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        for (const direction of ["across", "down"] as const) {
          const intersections = canPlaceWord(grid, word.answer, row, col, direction);
          if (intersections < 0) {
            continue;
          }

          const centeredness = Math.abs(centerRow - row) + Math.abs(centerRow - col);
          const score = intersections * 10 - centeredness;

          if (score > bestScore) {
            bestScore = score;
            bestPlacement = { wordId: word.id, row, col, direction };
          }
        }
      }
    }

    if (!bestPlacement) {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const fallback = canPlaceWord(grid, word.answer, row, col, "across");
          if (fallback >= 0) {
            bestPlacement = { wordId: word.id, row, col, direction: "across" };
            break;
          }
        }

        if (bestPlacement) {
          break;
        }
      }
    }

    if (!bestPlacement) {
      continue;
    }

    writeWordToGrid(grid, word.answer, bestPlacement.row, bestPlacement.col, bestPlacement.direction);
    placements.push(bestPlacement);
  }

  const numberedPlacements = placements
    .sort((left, right) => left.row - right.row || left.col - right.col || (left.direction === "across" ? -1 : 1))
    .map((placement, index) => ({ ...placement, clueNumber: index + 1 }));

  const cellMap = new Map<string, PuzzleBoardCell>();

  for (const placement of numberedPlacements) {
    const word = words.find((entry) => entry.id === placement.wordId);
    if (!word) {
      continue;
    }

    const { row: rowStep, col: colStep } = getStep(placement.direction);
    for (let index = 0; index < word.answer.length; index += 1) {
      const row = placement.row + rowStep * index;
      const col = placement.col + colStep * index;
      const key = `${row}:${col}`;
      const existing = cellMap.get(key);

      if (existing) {
        existing.wordIds.push(word.id);
        if (index === 0) {
          existing.clueNumbers.push(placement.clueNumber);
        }
        continue;
      }

      cellMap.set(key, {
        row,
        col,
        solution: word.answer[index],
        clueNumbers: index === 0 ? [placement.clueNumber] : [],
        wordIds: [word.id],
      });
    }
  }

  return {
    size,
    placements: numberedPlacements,
    cells: [...cellMap.values()],
  };
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

  let blurb = `${theme.strapline} Tonight's lane drifts through ${moodDescriptors.join(" and ")} for ${tone}. ${cadence} The scene points the way, but the exact words stay hidden until you earn them.`;

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

export function buildPuzzleRun(input: Partial<PuzzleOptions> = {}): PuzzleRun {
  const options: PuzzleOptions = {
    mode: input.mode ?? "custom",
    challenge: input.challenge ?? "quest",
    topics: normalizeTopics(input.topics ?? defaultTopics),
    puzzleSize: clampPuzzleSize(input.puzzleSize ?? 7),
    style: input.style ?? "alpha",
    clueDensity: input.clueDensity ?? 2,
    timerEnabled: input.timerEnabled ?? true,
    learningMode: input.learningMode ?? false,
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

  const board = buildPuzzleBoard(chosen);
  const placedWordIds = new Set(board.placements.map((placement) => placement.wordId));
  const placedWords = chosen.filter((word) => placedWordIds.has(word.id));
  const theme = getThemeStyle(options.style);
  const labelTopic = topicCatalog.find((topic) => topic.id === options.topics[0])?.label ?? "Word Puzzle";

  return {
    id: `${hashString(`${resolvedSeed}:${options.challenge}:${options.topics.join(",")}:${options.puzzleSize}`)}`,
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
