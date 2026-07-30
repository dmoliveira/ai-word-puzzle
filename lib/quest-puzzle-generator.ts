import type { PuzzleOptions } from "@/lib/game-types";
import { buildPuzzleRun, type PuzzleGenerationRequest } from "@/lib/puzzle-generator";
import { questWordBank } from "@/lib/quest-word-bank";

export function buildQuestPuzzleRun(
  input: Partial<PuzzleOptions> = {},
  nowMs = Date.now(),
  request: Omit<PuzzleGenerationRequest, "sourceWords"> = {},
) {
  return buildPuzzleRun({ ...input, boardView: "quest" }, nowMs, { ...request, sourceWords: questWordBank });
}
