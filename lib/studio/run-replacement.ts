import type { CurrentRunState, PersistedRunState, ProgressSnapshot, PuzzleRun } from "@/lib/game-types";
import { recordRunProgress } from "@/lib/progress";
import { createAttemptFromRun, isAttemptComplete, isStartedAttempt, snapshotAttempt } from "@/lib/run-state";
import type { StorageWriteResult } from "@/lib/session-storage";

type RunReplacementInput = {
  current: CurrentRunState;
  progress: ProgressSnapshot;
  buildRun: (nowMs: number) => PuzzleRun | Promise<PuzzleRun>;
  persist: (state: PersistedRunState, progress: ProgressSnapshot, nowMs: number) => Promise<StorageWriteResult>;
  nowMs: number;
  attemptId?: string;
};

export type RunReplacementResult =
  | {
    ok: true;
    state: PersistedRunState;
    progress: ProgressSnapshot;
    outgoing: PersistedRunState | null;
    storage: Extract<StorageWriteResult, { ok: true }>;
  }
  | {
    ok: false;
    state: CurrentRunState;
    progress: ProgressSnapshot;
    reason: "generation-failed" | "persistence-failed";
    storage?: Exclude<StorageWriteResult, { ok: true }>;
    error?: unknown;
  };

export function needsRunReplacementConfirmation(state: CurrentRunState) {
  return isStartedAttempt(state) && state.completedAt === null && !isAttemptComplete(state);
}

export async function replaceRunTransaction({
  current,
  progress,
  buildRun,
  persist,
  nowMs,
  attemptId,
}: RunReplacementInput): Promise<RunReplacementResult> {
  let run: PuzzleRun;
  try {
    run = await buildRun(nowMs);
  } catch (error) {
    return { ok: false, state: current, progress, reason: "generation-failed", error };
  }

  const outgoing = isStartedAttempt(current) ? snapshotAttempt(current, nowMs) : null;
  const progressWithOutgoing = outgoing ? recordRunProgress(progress, outgoing, nowMs) : progress;
  const candidate = createAttemptFromRun(run, nowMs, attemptId);
  const nextProgress = recordRunProgress(progressWithOutgoing, candidate, nowMs);

  try {
    const storage = await persist(candidate, nextProgress, nowMs);
    if (!storage.ok) {
      return { ok: false, state: current, progress, reason: "persistence-failed", storage };
    }
    return { ok: true, state: candidate, progress: nextProgress, outgoing, storage };
  } catch (error) {
    return { ok: false, state: current, progress, reason: "persistence-failed", error };
  }
}
