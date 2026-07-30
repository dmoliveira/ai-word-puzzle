import type { PuzzleOptions, PuzzleRun, RunSummary } from "@/lib/game-types";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { normalizePuzzleOptions, type SharedPuzzleProvenance } from "@/lib/puzzle-options";
import { currentCorpusRevision, puzzleFingerprintVersion } from "@/lib/puzzle-provenance";
import { buildRunForOptions } from "@/lib/run-builder";

type ReplaySummary = RunSummary;
const exactReplayCache = new Map<string, boolean>();

function replayOptions(summary: ReplaySummary, nowMs: number) {
  const options = normalizePuzzleOptions(summary.options, nowMs);
  return {
    ...options,
    seed: summary.mode === "daily" ? summary.seed.replace(/^daily:/, "") : options.seed,
  };
}

function expectedProvenance(summary: ReplaySummary): SharedPuzzleProvenance | null {
  return (summary.generatorVersion === 3 || summary.generatorVersion === 4)
    && summary.corpusRevision === currentCorpusRevision
    && summary.fingerprintVersion === puzzleFingerprintVersion
    && typeof summary.puzzleFingerprint === "string"
    ? {
        generatorVersion: summary.generatorVersion,
        corpusRevision: summary.corpusRevision,
        fingerprintVersion: 1,
        puzzleFingerprint: summary.puzzleFingerprint,
      }
    : null;
}

function matchesSummary(run: PuzzleRun, summary: ReplaySummary, expected: SharedPuzzleProvenance) {
  return run.puzzleId === summary.puzzleId
    && run.generatorVersion === expected.generatorVersion
    && run.corpusRevision === expected.corpusRevision
    && run.fingerprintVersion === expected.fingerprintVersion
    && run.puzzleFingerprint === expected.puzzleFingerprint;
}

export async function resolveSavedRunReplay(summary: ReplaySummary, nowMs = Date.now(), signal?: AbortSignal): Promise<
  | { kind: "exact"; options: PuzzleOptions; run: PuzzleRun; expectedProvenance: SharedPuzzleProvenance }
  | { kind: "current-rules"; options: PuzzleOptions }
  | { kind: "unavailable-exact"; options: PuzzleOptions }> {
  const options = replayOptions(summary, nowMs);
  const expected = expectedProvenance(summary);
  if (!expected) return { kind: "current-rules", options };
  try {
    const run = await buildRunForOptions(options, nowMs, { generatorVersion: expected.generatorVersion }, signal);
    return matchesSummary(run, summary, expected)
      ? { kind: "exact", options, run, expectedProvenance: expected }
      : { kind: "unavailable-exact", options };
  } catch {
    if (signal?.aborted) throw new Error("Replay verification was superseded.");
    return { kind: "unavailable-exact", options };
  }
}

export function canReplaySummaryExactly(summary: ReplaySummary) {
  if (summary.options.boardView === "quest") return false;
  const key = JSON.stringify([
    summary.puzzleId,
    summary.generatorVersion,
    summary.corpusRevision,
    summary.fingerprintVersion,
    summary.puzzleFingerprint,
    summary.seed,
    summary.options,
  ]);
  const cached = exactReplayCache.get(key);
  if (cached !== undefined) return cached;
  const expected = expectedProvenance(summary);
  if (!expected) return false;
  try {
    const run = buildPuzzleRun(replayOptions(summary, Date.parse(summary.createdAt)), Date.parse(summary.createdAt), { generatorVersion: expected.generatorVersion });
    const exact = matchesSummary(run, summary, expected);
    exactReplayCache.set(key, exact);
    return exact;
  } catch {
    exactReplayCache.set(key, false);
    return false;
  }
}

export function getSavedReplayActionLabel(summary: ReplaySummary) {
  if (summary.options.boardView === "quest" && expectedProvenance(summary)) return "Verify and replay exact puzzle";
  return canReplaySummaryExactly(summary) ? "Replay exact puzzle" : "Use settings/current rules";
}
