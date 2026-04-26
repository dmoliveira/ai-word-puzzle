export type ChallengeLevel = "breeze" | "quest" | "mythic";

export type ThemeStyleId = "alpha" | "nebula" | "sunforge" | "arcade" | "classic";
export type BoardView = "crossword" | "quest";

export type PuzzleMode = "custom" | "daily";

export type TopicId =
  | "myth"
  | "cosmos"
  | "ocean"
  | "garden"
  | "city"
  | "music"
  | "kitchen"
  | "wild"
  | "weather"
  | "desert"
  | "festival"
  | "winter"
  | "invent"
  | "story"
  | "greek";

export type PuzzleWord = {
  id: string;
  answer: string;
  normalized: string;
  topicId: TopicId;
  topicLabel: string;
  difficulty: ChallengeLevel;
  frequencyBand: "common" | "uncommon" | "rare";
  length: number;
  prompt: string;
  microHint: string;
  teaser: string;
  learningNote: string;
  plainMeaning: string;
  pronunciationHint: string;
  usageExample: string;
  translationAid: string;
  relatedWords: string[];
  visuals: string[];
  greekMark: string;
  weight: number;
};

export type PuzzleDirection = "across" | "down";

export type PuzzlePlacement = {
  wordId: string;
  row: number;
  col: number;
  direction: PuzzleDirection;
  clueNumber: number;
};

export type PuzzleBoardCell = {
  row: number;
  col: number;
  solution: string;
  clueNumbers: number[];
  wordIds: string[];
};

export type PuzzleBoard = {
  size: number;
  placements: PuzzlePlacement[];
  cells: PuzzleBoardCell[];
};

export type PuzzleOptions = {
  mode: PuzzleMode;
  challenge: ChallengeLevel;
  topics: TopicId[];
  puzzleSize: number;
  boardView: BoardView;
  style: ThemeStyleId;
  clueDensity: 1 | 2 | 3;
  timerEnabled: boolean;
  learningMode: boolean;
  seed: string;
};

export type PuzzleRun = {
  id: string;
  createdAt: string;
  seed: string;
  options: PuzzleOptions;
  title: string;
  blurb: string;
  words: PuzzleWord[];
  board: PuzzleBoard;
};

export type TopicPack = {
  id: TopicId;
  label: string;
  mood: string;
  scene: string[];
  icons: string[];
  easy: string[];
  medium: string[];
  hard: string[];
};

export type ThemeStyle = {
  id: ThemeStyleId;
  label: string;
  strapline: string;
  className: string;
  greekConstellation: string[];
  motif: string;
};

export type PersistedRunState = {
  run: PuzzleRun;
  guesses: Record<string, string>;
  cellEntries: Record<string, string>;
  solvedIds: string[];
  activeWordId: string | null;
  hintLevels: Record<string, number>;
  paused: boolean;
  elapsedMs: number;
  lastTickAt: number | null;
};

export type RunSummary = {
  runId: string;
  title: string;
  seed: string;
  options: PuzzleOptions;
  mode: PuzzleMode;
  challenge: ChallengeLevel;
  style: ThemeStyleId;
  solvedCount: number;
  totalWords: number;
  finished: boolean;
  createdAt: string;
  completedAt: string | null;
};

export type ProgressSnapshot = {
  streak: number;
  bestStreak: number;
  lastDailySeed: string | null;
  lastCompletedAt: string | null;
  history: RunSummary[];
};
