import type { PuzzleOptions } from "@/lib/game-types";
import { buildPuzzleRun, type PuzzleGenerationRequest } from "@/lib/puzzle-generator";

type PublicGenerationRequest = Omit<PuzzleGenerationRequest, "sourceWords">;

let questBuilderPromise: Promise<typeof import("@/lib/quest-puzzle-generator")> | null = null;

export class RunBuildAbortedError extends Error {
  constructor() {
    super("Puzzle generation was superseded.");
    this.name = "RunBuildAbortedError";
  }
}

function assertCurrent(signal?: AbortSignal) {
  if (signal?.aborted) throw new RunBuildAbortedError();
}

export function isQuestBuilderLoaded() {
  return questBuilderPromise !== null;
}

export async function buildRunForOptions(
  input: Partial<PuzzleOptions> = {},
  nowMs = Date.now(),
  request: PublicGenerationRequest = {},
  signal?: AbortSignal,
) {
  assertCurrent(signal);
  if ((input.boardView ?? "crossword") !== "quest") {
    return buildPuzzleRun(input, nowMs, request);
  }

  questBuilderPromise ??= import("@/lib/quest-puzzle-generator").catch((error) => {
    questBuilderPromise = null;
    throw error;
  });
  const { buildQuestPuzzleRun } = await questBuilderPromise;
  assertCurrent(signal);
  const run = buildQuestPuzzleRun(input, nowMs, request);
  assertCurrent(signal);
  return run;
}
