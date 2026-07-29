import type { CurrentRunState, ProgressSnapshot, PuzzleOptions } from "@/lib/game-types";
import { buildPuzzleRun, PuzzleGenerationError } from "@/lib/puzzle-generator";
import { getCanonicalDailyOptions, type SharedOptionsResult } from "@/lib/puzzle-options";
import { createPreparedRunState, setAttemptVisibility } from "@/lib/run-state";
import { prepareStoredAttempt, shouldRestoreAttempt, type StoredGameResult } from "@/lib/session-storage";

export type BootstrapSource = "stored" | "shared" | "current-daily" | "explicit";

export type StudioBootstrap = {
  current: CurrentRunState;
  builderOptions: PuzzleOptions;
  progress: ProgressSnapshot;
  source: BootstrapSource;
  warning: string | null;
  resolvedAtMs: number;
};

function prepare(options: PuzzleOptions, nowMs: number, generatorVersion?: 3 | 4) {
  return createPreparedRunState(buildPuzzleRun(options, nowMs, { generatorVersion }));
}

export function resolveStudioBootstrap({
  stored,
  shared,
  nowMs,
  visible = true,
}: {
  stored: StoredGameResult;
  shared: SharedOptionsResult;
  nowMs: number;
  visible?: boolean;
}): StudioBootstrap {
  const dailyOptions = getCanonicalDailyOptions(nowMs);
  const daily = prepare(dailyOptions, nowMs);
  const progress = stored.progress;

  if (stored.currentAttempt && shouldRestoreAttempt(stored.currentAttempt, daily.run.puzzleId)) {
    const resumed = prepareStoredAttempt(stored.currentAttempt, nowMs);
    const current = visible ? resumed : setAttemptVisibility(resumed, false, nowMs);
    const warning = shared.kind === "invalid"
      ? "That shared puzzle link was invalid, so your saved attempt was resumed."
      : shared.kind === "valid"
        ? "Your unfinished or current daily attempt was resumed. The shared puzzle link was not opened."
        : null;
    return {
      current,
      builderOptions: current.run.options,
      progress,
      source: "stored",
      warning,
      resolvedAtMs: nowMs,
    };
  }

  if (shared.kind === "valid") {
    try {
      const current = prepare(shared.options, nowMs, shared.generatorVersion);
      if (shared.expectedProvenance && (current.run.generatorVersion !== shared.expectedProvenance.generatorVersion
        || current.run.corpusRevision !== shared.expectedProvenance.corpusRevision
        || current.run.fingerprintVersion !== shared.expectedProvenance.fingerprintVersion
        || current.run.puzzleFingerprint !== shared.expectedProvenance.puzzleFingerprint)) {
        return {
          current: daily,
          builderOptions: daily.run.options,
          progress,
          source: "current-daily",
          warning: "That shared puzzle did not match its expected fingerprint, so nothing was replaced.",
          resolvedAtMs: nowMs,
        };
      }
      return {
        current,
        builderOptions: current.run.options,
        progress,
        source: "shared",
        warning: null,
        resolvedAtMs: nowMs,
      };
    } catch (error) {
      return {
        current: daily,
        builderOptions: daily.run.options,
        progress,
        source: "current-daily",
        warning: error instanceof PuzzleGenerationError
          ? `That shared puzzle could not be generated: ${error.message}`
          : "That shared puzzle could not be opened, so today’s puzzle is ready instead.",
        resolvedAtMs: nowMs,
      };
    }
  }

  return {
    current: daily,
    builderOptions: daily.run.options,
    progress,
    source: "current-daily",
    warning: shared.kind === "invalid"
      ? "That shared puzzle link was invalid, so today’s puzzle is ready instead."
      : null,
    resolvedAtMs: nowMs,
  };
}

export function refreshPreparedDaily(current: CurrentRunState, source: BootstrapSource, nowMs: number) {
  if (source !== "current-daily" || current.attemptId !== null) {
    return current;
  }

  const nextOptions = getCanonicalDailyOptions(nowMs);
  return current.run.seed === `daily:${nextOptions.seed}` ? current : prepare(nextOptions, nowMs);
}
