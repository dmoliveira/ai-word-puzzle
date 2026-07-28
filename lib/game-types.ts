export type ChallengeLevel = "breeze" | "quest" | "mythic";

export type ThemeStyleId = "alpha" | "nebula" | "sunforge" | "arcade" | "classic";
export type BoardView = "crossword" | "quest";

export type PuzzleMode = "custom" | "daily";

export type PuzzleFamily = "classic" | "mini" | "themed";

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

export type ContentPackId =
  | "myth-beings"
  | "myth-relics"
  | "cosmos-flight"
  | "cosmos-phenomena"
  | "ocean-life"
  | "ocean-sailing"
  | "garden-blooms"
  | "garden-growers"
  | "city-transit"
  | "city-night"
  | "music-stage"
  | "music-instruments"
  | "kitchen-pantry"
  | "kitchen-bakes"
  | "wild-creatures"
  | "wild-landforms"
  | "weather-storms"
  | "weather-skies"
  | "desert-survival"
  | "desert-stones"
  | "festival-parade"
  | "festival-performance"
  | "winter-weather"
  | "winter-cozy"
  | "invent-workshop"
  | "invent-power"
  | "story-books"
  | "story-plot"
  | "greek-symbols"
  | "greek-scholar";

export type PuzzleWord = {
  id: string;
  answer: string;
  normalized: string;
  source: "topic" | "general" | "synthetic" | "lexicon";
  qualityStatus: "approved" | "unreviewed";
  clue: string | null;
  topicId: TopicId;
  topicLabel: string;
  contentPackIds: ContentPackId[];
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
  puzzleFamily: PuzzleFamily;
  topics: TopicId[];
  contentPackId: ContentPackId | "auto";
  puzzleSize: number;
  boardView: BoardView;
  style: ThemeStyleId;
  timerEnabled: boolean;
  learningMode: boolean;
  seed: string;
};

export type PuzzleRun = {
  id: string;
  puzzleId: string;
  generatorVersion: number;
  createdAt: string;
  seed: string;
  options: PuzzleOptions;
  title: string;
  blurb: string;
  words: PuzzleWord[];
  board: PuzzleBoard;
};

export type AssistLedger = {
  hintStepsByWord: Record<string, number>;
  revealedCellKeys: string[];
  anagramWordIds: string[];
  revealedWordIds: string[];
  puzzleRevealed: boolean;
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

export type ContentPack = {
  id: ContentPackId;
  topicId: TopicId;
  label: string;
  summary: string;
  answers: string[];
};

export type PersistedRunState = {
  schemaVersion: 2;
  attemptId: string;
  startedAt: string;
  completedAt: string | null;
  run: PuzzleRun;
  guesses: Record<string, string>;
  cellEntries: Record<string, string>;
  solvedIds: string[];
  activeWordId: string | null;
  assists: AssistLedger;
  paused: boolean;
  elapsedMs: number;
  lastTickAt: number | null;
};

export type AssistSummary = {
  total: number;
  hintSteps: number;
  revealedLetters: number;
  anagrams: number;
  revealedWords: number;
  puzzleRevealed: boolean;
};

export type RunSummary = {
  attemptId: string;
  puzzleId: string;
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
  canonicalDaily: boolean;
  elapsedMs: number;
  assists: AssistSummary;
  createdAt: string;
  completedAt: string | null;
};

export type ProgressSnapshot = {
  schemaVersion: 2;
  streak: number;
  bestStreak: number;
  lastDailySeed: string | null;
  lastCompletedAt: string | null;
  history: RunSummary[];
};

export type PersistedGame = {
  schemaVersion: 2;
  currentAttempt: PersistedRunState;
  progress: ProgressSnapshot;
};
