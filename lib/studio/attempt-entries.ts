import type { CurrentRunState, PersistedRunState, PuzzleBoardCell, PuzzlePlacement } from "@/lib/game-types";
import { getRunPathCells, getRunTargetCells, getRunWordPath, isPuzzleBoardV3 } from "@/lib/puzzle-board";

export type EntryTransaction =
  | { ok: true; state: PersistedRunState; changed: boolean }
  | { ok: false; state: PersistedRunState; reason: "locked-cell-conflict" | "missing-cell" | "missing-word" };

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getWord(state: CurrentRunState, wordId: string) {
  return state.run.words.find((word) => word.id === wordId) ?? null;
}

export function getPlacementCells(state: CurrentRunState, placement: PuzzlePlacement) {
  const word = getWord(state, placement.wordId);
  const board = state.run.board;
  if (!word || !isPuzzleBoardV3(board)) return [] as PuzzleBoardCell[];
  return Array.from({ length: word.length }, (_, index) => {
    const row = placement.row + (placement.direction === "down" ? index : 0);
    const col = placement.col + (placement.direction === "across" ? index : 0);
    return board.cells.find((cell) => cell.row === row && cell.col === col);
  }).filter((cell): cell is PuzzleBoardCell => Boolean(cell));
}

export function getWordCells(state: CurrentRunState, wordId: string) {
  const targetCells = new Map(getRunTargetCells(state.run).map((cell) => [cellKey(cell.row, cell.col), cell]));
  return getRunPathCells(state.run, wordId)
    .map(({ row, col }) => targetCells.get(cellKey(row, col)))
    .filter((cell): cell is PuzzleBoardCell => Boolean(cell));
}

export function deriveGuessFromCells(state: CurrentRunState, wordId: string) {
  if (!getRunWordPath(state.run, wordId)) return "";
  return getWordCells(state, wordId)
    .map((cell) => state.cellEntries[cellKey(cell.row, cell.col)] ?? " ")
    .join("")
    .trimEnd();
}

function computeSolvedIds(state: CurrentRunState) {
  return state.run.words
    .filter((word) => deriveGuessFromCells(state, word.id).replace(/[^a-z]/g, "") === word.normalized)
    .map((word) => word.id);
}

function rebuildState(state: PersistedRunState, entries: Record<string, string>, fallbackWordId: string) {
  const provisional = { ...state, cellEntries: entries };
  const solvedIds = computeSolvedIds(provisional);
  const activeWordId = solvedIds.includes(fallbackWordId)
    ? state.run.words.find((word) => !solvedIds.includes(word.id))?.id ?? fallbackWordId
    : fallbackWordId;
  return {
    ...provisional,
    guesses: Object.fromEntries(state.run.words.map((word) => [word.id, deriveGuessFromCells(provisional, word.id)])),
    solvedIds,
    activeWordId,
  };
}

function isProtectedCell(state: PersistedRunState, cell: PuzzleBoardCell) {
  const key = cellKey(cell.row, cell.col);
  return state.assists.revealedCellKeys.includes(key)
    || cell.wordIds.some((wordId) => state.solvedIds.includes(wordId));
}

function normalizePositionalInput(value: string, length: number) {
  return [...value.toLowerCase().replace(/[^a-z ]/g, "")].slice(0, length);
}

export function applyWordEntry(state: PersistedRunState, wordId: string, value: string): EntryTransaction {
  const word = getWord(state, wordId);
  if (!word || !getRunWordPath(state.run, wordId)) return { ok: false, state, reason: "missing-word" };

  const cells = getWordCells(state, wordId);
  if (cells.length !== word.length) return { ok: false, state, reason: "missing-cell" };
  const requested = normalizePositionalInput(value, word.length);
  const entries = { ...state.cellEntries };

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const key = cellKey(cell.row, cell.col);
    const existing = entries[key] ?? "";
    const next = requested[index] ?? "";
    if (isProtectedCell(state, cell)) {
      if (next && next !== existing) return { ok: false, state, reason: "locked-cell-conflict" };
      continue;
    }
    if (next) entries[key] = next;
    else delete entries[key];
  }

  const nextState = rebuildState(state, entries, wordId);
  return { ok: true, state: nextState, changed: JSON.stringify(entries) !== JSON.stringify(state.cellEntries) };
}

export function applyCellEntry(state: PersistedRunState, row: number, col: number, value: string, fallbackWordId: string): EntryTransaction {
  const cell = getRunTargetCells(state.run).find((candidate) => candidate.row === row && candidate.col === col);
  if (!cell) return { ok: false, state, reason: "missing-cell" };
  const key = cellKey(row, col);
  const next = value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 1);
  const existing = state.cellEntries[key] ?? "";
  if (isProtectedCell(state, cell) && next !== existing) {
    return { ok: false, state, reason: "locked-cell-conflict" };
  }

  const entries = { ...state.cellEntries };
  if (next) entries[key] = next;
  else delete entries[key];
  const nextState = rebuildState(state, entries, fallbackWordId);
  return { ok: true, state: nextState, changed: next !== existing };
}

export function clearWordEntries(state: PersistedRunState, wordId: string): EntryTransaction {
  if (!getRunWordPath(state.run, wordId)) return { ok: false, state, reason: "missing-word" };
  const entries = { ...state.cellEntries };
  for (const cell of getWordCells(state, wordId)) {
    if (!isProtectedCell(state, cell)) delete entries[cellKey(cell.row, cell.col)];
  }
  const nextState = rebuildState(state, entries, wordId);
  return { ok: true, state: nextState, changed: JSON.stringify(entries) !== JSON.stringify(state.cellEntries) };
}
