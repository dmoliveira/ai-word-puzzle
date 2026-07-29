import type {
  PuzzleBoardCell,
  PuzzleBoardV3,
  PuzzleDirection,
  PuzzleRun,
} from "@/lib/game-types";
import { getQuestV3FillLetter } from "@/lib/puzzle-provenance";
import type { QuestV4Board, QuestV4Delta } from "@/lib/quest-v4-engine";

type VersionedPuzzleRun = Omit<PuzzleRun, "board"> & { board: PuzzleBoardV3 | QuestV4Board };

export type RunWordPath = {
  wordId: string;
  row: number;
  col: number;
  deltaRow: QuestV4Delta;
  deltaCol: QuestV4Delta;
  length: number;
  clueNumber: number;
  direction: string;
  legacyDirection: PuzzleDirection | null;
};

export function isQuestV4Board(board: PuzzleBoardV3 | QuestV4Board): board is QuestV4Board {
  return "kind" in board && board.kind === "quest-v4";
}

export function isPuzzleBoardV3(board: PuzzleBoardV3 | QuestV4Board): board is PuzzleBoardV3 {
  return !isQuestV4Board(board);
}

export function getRunBoardSize(run: VersionedPuzzleRun) {
  return run.board.size;
}

export function getRunWordPath(run: VersionedPuzzleRun, wordId: string): RunWordPath | null {
  const word = run.words.find((candidate) => candidate.id === wordId);
  if (!word) return null;
  if (isQuestV4Board(run.board)) {
    const index = run.board.paths.findIndex((path) => path.wordId === wordId);
    const path = run.board.paths[index];
    return path ? {
      ...path,
      length: word.length,
      clueNumber: index + 1,
      direction: getDeltaDirectionLabel(path.deltaRow, path.deltaCol),
      legacyDirection: null,
    } : null;
  }
  const placement = run.board.placements.find((candidate) => candidate.wordId === wordId);
  if (!placement) return null;
  return {
    wordId,
    row: placement.row,
    col: placement.col,
    deltaRow: placement.direction === "down" ? 1 : 0,
    deltaCol: placement.direction === "across" ? 1 : 0,
    length: word.length,
    clueNumber: placement.clueNumber,
    direction: placement.direction,
    legacyDirection: placement.direction,
  };
}

export function getRunWordPaths(run: VersionedPuzzleRun) {
  return run.words.map((word) => getRunWordPath(run, word.id)).filter((path): path is RunWordPath => Boolean(path));
}

export function getRunPathCells(run: VersionedPuzzleRun, wordId: string) {
  const path = getRunWordPath(run, wordId);
  if (!path) return [];
  return Array.from({ length: path.length }, (_, index) => ({
    row: path.row + path.deltaRow * index,
    col: path.col + path.deltaCol * index,
  }));
}

export function getRunTargetCells(run: VersionedPuzzleRun): PuzzleBoardCell[] {
  if (isPuzzleBoardV3(run.board)) return run.board.cells;
  const cells = new Map<string, PuzzleBoardCell>();
  for (const [pathIndex, path] of run.board.paths.entries()) {
    for (const [letterIndex, coordinate] of getRunPathCells(run, path.wordId).entries()) {
      const key = `${coordinate.row}:${coordinate.col}`;
      const current = cells.get(key);
      const solution = run.board.grid[coordinate.row]?.[coordinate.col] ?? "";
      if (current) {
        if (!current.wordIds.includes(path.wordId)) current.wordIds.push(path.wordId);
        if (letterIndex === 0 && !current.clueNumbers.includes(pathIndex + 1)) current.clueNumbers.push(pathIndex + 1);
      } else {
        cells.set(key, {
          ...coordinate,
          solution,
          clueNumbers: letterIndex === 0 ? [pathIndex + 1] : [],
          wordIds: [path.wordId],
        });
      }
    }
  }
  return [...cells.values()].sort((left, right) => left.row - right.row || left.col - right.col);
}

export function getRunGridLetter(run: VersionedPuzzleRun, row: number, col: number) {
  if (isQuestV4Board(run.board)) return run.board.grid[row]?.[col] ?? null;
  const target = run.board.cells.find((cell) => cell.row === row && cell.col === col);
  if (target) return target.solution;
  return run.options.boardView === "quest" ? getQuestV3FillLetter(run.seed, row, col) : null;
}

function getDeltaDirectionLabel(deltaRow: QuestV4Delta, deltaCol: QuestV4Delta) {
  const vertical = deltaRow < 0 ? "up" : deltaRow > 0 ? "down" : "";
  const horizontal = deltaCol < 0 ? "left" : deltaCol > 0 ? "right" : "";
  return [vertical, horizontal].filter(Boolean).join("-");
}

export function getRunPathDirectionLabel(path: RunWordPath) {
  return path.direction;
}

export function getRunPathEndpoint(path: RunWordPath) {
  return {
    row: path.row + path.deltaRow * (path.length - 1),
    col: path.col + path.deltaCol * (path.length - 1),
  };
}

export function canonicalEndpointKey(left: { row: number; col: number }, right: { row: number; col: number }) {
  const leftKey = `${left.row}:${left.col}`;
  const rightKey = `${right.row}:${right.col}`;
  return leftKey < rightKey ? `${leftKey}|${rightKey}` : `${rightKey}|${leftKey}`;
}

export function getRunPathEndpointKey(path: RunWordPath) {
  return canonicalEndpointKey({ row: path.row, col: path.col }, getRunPathEndpoint(path));
}
