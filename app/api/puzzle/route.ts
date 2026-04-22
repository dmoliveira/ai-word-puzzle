import { NextResponse } from "next/server";
import type { ChallengeLevel, PuzzleMode, ThemeStyleId, TopicId } from "@/lib/game-types";
import { buildPuzzleRun, getDefaultDailySeed } from "@/lib/puzzle-generator";

const validChallenges = new Set<ChallengeLevel>(["breeze", "quest", "mythic"]);
const validStyles = new Set<ThemeStyleId>(["alpha", "nebula", "sunforge", "arcade"]);
const validModes = new Set<PuzzleMode>(["custom", "daily"]);
const validTopics = new Set<TopicId>([
  "myth",
  "cosmos",
  "ocean",
  "garden",
  "city",
  "music",
  "kitchen",
  "wild",
  "weather",
  "invent",
  "story",
  "greek",
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const challenge = searchParams.get("challenge");
  const style = searchParams.get("style");
  const mode = searchParams.get("mode");
  const puzzleSize = Number(searchParams.get("puzzleSize") ?? "7");
  const clueDensity = Number(searchParams.get("clueDensity") ?? "2") as 1 | 2 | 3;
  const timerEnabled = searchParams.get("timerEnabled") !== "false";
  const requestedSeed = searchParams.get("seed")?.trim() ?? "";
  const topics = (searchParams.get("topics") ?? "")
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic): topic is TopicId => validTopics.has(topic as TopicId));

  const validatedMode = validModes.has(mode as PuzzleMode) ? (mode as PuzzleMode) : "custom";

  const run = buildPuzzleRun({
    challenge: validChallenges.has(challenge as ChallengeLevel) ? (challenge as ChallengeLevel) : "quest",
    style: validStyles.has(style as ThemeStyleId) ? (style as ThemeStyleId) : "alpha",
    mode: validatedMode,
    topics,
    puzzleSize: Number.isFinite(puzzleSize) ? puzzleSize : 7,
    clueDensity: clueDensity === 1 || clueDensity === 2 || clueDensity === 3 ? clueDensity : 2,
    timerEnabled,
    seed: validatedMode === "daily" ? requestedSeed || getDefaultDailySeed() : requestedSeed,
  });

  return NextResponse.json({ run });
}
