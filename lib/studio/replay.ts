import type { PuzzleOptions, PuzzleRun, RunSummary } from "@/lib/game-types";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import { normalizePuzzleOptions, type SharedPuzzleProvenance } from "@/lib/puzzle-options";
import { currentCorpusRevision, puzzleFingerprintVersion } from "@/lib/puzzle-provenance";

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
  return summary.generatorVersion === 3
    && summary.corpusRevision === currentCorpusRevision
    && summary.fingerprintVersion === puzzleFingerprintVersion
    && typeof summary.puzzleFingerprint === "string"
    ? {
        generatorVersion: 3,
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

export function resolveSavedRunReplay(summary: ReplaySummary, nowMs = Date.now()):
  | { kind: "exact"; options: PuzzleOptions; run: PuzzleRun; expectedProvenance: SharedPuzzleProvenance }
  | { kind: "current-rules"; options: PuzzleOptions } {
  const options = replayOptions(summary, nowMs);
  const expected = expectedProvenance(summary);
  if (!expected) return { kind: "current-rules", options };
  try {
    const run = buildPuzzleRun(options, nowMs);
    return matchesSummary(run, summary, expected)
      ? { kind: "exact", options, run, expectedProvenance: expected }
      : { kind: "current-rules", options };
  } catch {
    return { kind: "current-rules", options };
  }
}

export function canReplaySummaryExactly(summary: ReplaySummary) {
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
  const exact = resolveSavedRunReplay(summary, Date.parse(summary.createdAt)).kind === "exact";
  exactReplayCache.set(key, exact);
  return exact;
}
