import type { CurrentRunState, PersistedRunState, ProgressSnapshot, PuzzleRun } from "@/lib/game-types";
import { recordRunProgress } from "@/lib/progress";
import { createAttemptFromRun, isAttemptComplete, isStartedAttempt, snapshotAttempt } from "@/lib/run-state";

type RunReplacementInput = {
  current: CurrentRunState;
  progress: ProgressSnapshot;
  buildRun: () => PuzzleRun;
  persist: (state: PersistedRunState, progress: ProgressSnapshot, nowMs: number) => boolean;
  nowMs: number;
  attemptId?: string;
};

export type RunReplacementResult =
  | {
    ok: true;
    state: PersistedRunState;
    progress: ProgressSnapshot;
    outgoing: PersistedRunState | null;
  }
  | {
    ok: false;
    state: CurrentRunState;
    progress: ProgressSnapshot;
    reason: "generation-failed" | "persistence-failed";
    error?: unknown;
  };

export function needsRunReplacementConfirmation(state: CurrentRunState) {
  return isStartedAttempt(state) && state.completedAt === null && !isAttemptComplete(state);
}

export function replaceRunTransaction({
  current,
  progress,
  buildRun,
  persist,
  nowMs,
  attemptId,
}: RunReplacementInput): RunReplacementResult {
  let run: PuzzleRun;
  try {
    run = buildRun();
  } catch (error) {
    return { ok: false, state: current, progress, reason: "generation-failed", error };
  }

  const outgoing = isStartedAttempt(current) ? snapshotAttempt(current, nowMs) : null;
  const progressWithOutgoing = outgoing ? recordRunProgress(progress, outgoing, nowMs) : progress;
  const candidate = createAttemptFromRun(run, nowMs, attemptId);
  const nextProgress = recordRunProgress(progressWithOutgoing, candidate, nowMs);

  try {
    if (!persist(candidate, nextProgress, nowMs)) {
      return { ok: false, state: current, progress, reason: "persistence-failed" };
    }
  } catch (error) {
    return { ok: false, state: current, progress, reason: "persistence-failed", error };
  }

  return {
    ok: true,
    state: candidate,
    progress: nextProgress,
    outgoing,
  };
}
