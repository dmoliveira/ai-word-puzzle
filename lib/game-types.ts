export type ChallengeLevel = "breeze" | "quest" | "mythic";

export type ThemeStyleId = "alpha" | "nebula" | "sunforge" | "arcade";

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
  length: number;
  prompt: string;
  microHint: string;
  teaser: string;
  visuals: string[];
  greekMark: string;
  weight: number;
};

export type PuzzleOptions = {
  mode: PuzzleMode;
  challenge: ChallengeLevel;
  topics: TopicId[];
  puzzleSize: number;
  style: ThemeStyleId;
  clueDensity: 1 | 2 | 3;
  timerEnabled: boolean;
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
};

export type PersistedRunState = {
  run: PuzzleRun;
  guesses: Record<string, string>;
  solvedIds: string[];
  activeWordId: string | null;
  hintLevels: Record<string, number>;
  paused: boolean;
  elapsedMs: number;
  lastTickAt: number | null;
};
