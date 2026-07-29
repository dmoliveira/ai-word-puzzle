import type { PuzzleBoard, PuzzleOptions, PuzzleRun, PuzzleWord } from "@/lib/game-types";
import { sha256Hex } from "@/lib/sha256";

export const currentCorpusRevision = "word-bank-r1" as const;
export const puzzleFingerprintVersion = 1 as const;

type FingerprintInput = {
  generatorVersion: number;
  corpusRevision: string;
  seed: string;
  options: PuzzleOptions;
  words: readonly PuzzleWord[];
  board: PuzzleBoard;
};

export function getQuestV3FillLetter(seed: string, row: number, col: number) {
  const letters = "etaoinshrdlucmfwypvbgkqjxz";
  const hashBase = `${seed}:${row}:${col}`;
  let hash = 0;
  for (let index = 0; index < hashBase.length; index += 1) {
    hash = (hash * 31 + hashBase.charCodeAt(index)) % letters.length;
  }
  return letters[hash];
}

export function materializeQuestV3Grid(board: PuzzleBoard, seed: string) {
  const cells = new Map(board.cells.map((cell) => [`${cell.row}:${cell.col}`, cell.solution]));
  return Array.from({ length: board.size }, (_, row) => Array.from({ length: board.size }, (_, col) => (
    cells.get(`${row}:${col}`) ?? getQuestV3FillLetter(seed, row, col)
  )).join(""));
}

function fingerprintPayload(input: FingerprintInput) {
  const { options } = input;
  return JSON.stringify([
    "astra-lexa/puzzle-fingerprint-1",
    input.generatorVersion,
    input.corpusRevision,
    input.seed,
    {
      mode: options.mode,
      challenge: options.challenge,
      puzzleFamily: options.puzzleFamily,
      topics: options.topics,
      contentPackId: options.contentPackId,
      puzzleSize: options.puzzleSize,
      boardView: options.boardView,
    },
    input.words,
    input.board,
    options.boardView === "quest" ? materializeQuestV3Grid(input.board, input.seed) : null,
  ]);
}

export function computePuzzleFingerprint(input: FingerprintInput) {
  return `p1-${sha256Hex(fingerprintPayload(input))}`;
}

export function hasVerifiedPuzzleProvenance(run: PuzzleRun) {
  return run.fingerprintVersion === puzzleFingerprintVersion
    && typeof run.corpusRevision === "string"
    && run.corpusRevision.length > 0
    && typeof run.puzzleFingerprint === "string"
    && /^p1-[a-f0-9]{64}$/.test(run.puzzleFingerprint)
    && run.puzzleFingerprint === computePuzzleFingerprint({
      generatorVersion: run.generatorVersion,
      corpusRevision: run.corpusRevision,
      seed: run.seed,
      options: run.options,
      words: run.words,
      board: run.board,
    });
}
