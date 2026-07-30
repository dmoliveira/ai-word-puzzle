import type { PuzzleBoardCell, PuzzleBoardV3, PuzzleDirection, PuzzlePlacement, PuzzleWord } from "@/lib/game-types";

type DraftPlacement = {
  word: PuzzleWord;
  row: number;
  col: number;
  direction: PuzzleDirection;
};

type OccupiedCell = {
  letter: string;
  directions: Set<PuzzleDirection>;
};

const maximumCrosswordSize = 17;
const maximumSearchNodes = 100_000;

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getStep(direction: PuzzleDirection) {
  return direction === "across" ? { row: 0, col: 1 } : { row: 1, col: 0 };
}

function getCellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function getPlacementCells(placement: DraftPlacement) {
  const step = getStep(placement.direction);
  return Array.from({ length: placement.word.answer.length }, (_, index) => ({
    row: placement.row + step.row * index,
    col: placement.col + step.col * index,
    letter: placement.word.answer[index],
  }));
}

function buildOccupiedCells(placements: DraftPlacement[]) {
  const cells = new Map<string, OccupiedCell>();

  for (const placement of placements) {
    for (const cell of getPlacementCells(placement)) {
      const key = getCellKey(cell.row, cell.col);
      const existing = cells.get(key);
      if (existing) {
        existing.directions.add(placement.direction);
      } else {
        cells.set(key, { letter: cell.letter, directions: new Set([placement.direction]) });
      }
    }
  }

  return cells;
}

function getBounds(placements: DraftPlacement[]) {
  const cells = placements.flatMap(getPlacementCells);
  const rows = cells.map((cell) => cell.row);
  const cols = cells.map((cell) => cell.col);
  return {
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
  };
}

function validatePlacement(placements: DraftPlacement[], placement: DraftPlacement) {
  const occupied = buildOccupiedCells(placements);
  const cells = getPlacementCells(placement);
  const step = getStep(placement.direction);
  const before = getCellKey(placement.row - step.row, placement.col - step.col);
  const last = cells[cells.length - 1];
  const after = getCellKey(last.row + step.row, last.col + step.col);

  if (occupied.has(before) || occupied.has(after)) {
    return null;
  }

  let intersections = 0;
  for (const cell of cells) {
    const current = occupied.get(getCellKey(cell.row, cell.col));
    if (current) {
      if (current.letter !== cell.letter || current.directions.has(placement.direction)) {
        return null;
      }
      intersections += 1;
      continue;
    }

    const neighbors = placement.direction === "across"
      ? [getCellKey(cell.row - 1, cell.col), getCellKey(cell.row + 1, cell.col)]
      : [getCellKey(cell.row, cell.col - 1), getCellKey(cell.row, cell.col + 1)];
    if (neighbors.some((key) => occupied.has(key))) {
      return null;
    }
  }

  if (placements.length > 0 && intersections === 0) {
    return null;
  }

  const bounds = getBounds([...placements, placement]);
  const width = bounds.maxCol - bounds.minCol + 1;
  const height = bounds.maxRow - bounds.minRow + 1;
  if (width + 2 > maximumCrosswordSize || height + 2 > maximumCrosswordSize) {
    return null;
  }

  return { intersections, area: width * height };
}

function getCrosswordPlacements(placements: DraftPlacement[], word: PuzzleWord) {
  if (placements.length === 0) {
    return [{ placement: { word, row: 0, col: 0, direction: "across" as const }, intersections: 0, area: word.length }];
  }

  const occupied = buildOccupiedCells(placements);
  const seen = new Set<string>();
  const options: Array<{ placement: DraftPlacement; intersections: number; area: number }> = [];

  for (const [key, cell] of occupied) {
    const [row, col] = key.split(":").map(Number);
    for (let index = 0; index < word.answer.length; index += 1) {
      if (word.answer[index] !== cell.letter) {
        continue;
      }

      for (const existingDirection of cell.directions) {
        const direction: PuzzleDirection = existingDirection === "across" ? "down" : "across";
        const step = getStep(direction);
        const placement: DraftPlacement = {
          word,
          row: row - step.row * index,
          col: col - step.col * index,
          direction,
        };
        const placementKey = `${placement.row}:${placement.col}:${placement.direction}`;
        if (seen.has(placementKey)) {
          continue;
        }
        seen.add(placementKey);

        const result = validatePlacement(placements, placement);
        if (result) {
          options.push({ placement, ...result });
        }
      }
    }
  }

  return options;
}

function clueContainsAnswer(clue: string | null, answer: string) {
  return clue?.toLowerCase().split(/[^a-z]+/).includes(answer.toLowerCase()) ?? false;
}

function cluesAreCompatible(placements: DraftPlacement[], word: PuzzleWord) {
  return placements.every((placement) => !clueContainsAnswer(word.clue, placement.word.normalized)
    && !clueContainsAnswer(placement.word.clue, word.normalized));
}

function numberAndNormalizePlacements(drafts: DraftPlacement[]): PuzzleBoardV3 {
  const bounds = getBounds(drafts);
  const contentWidth = bounds.maxCol - bounds.minCol + 1;
  const contentHeight = bounds.maxRow - bounds.minRow + 1;
  const size = Math.max(9, contentWidth + 2, contentHeight + 2);
  const rowOffset = 1 - bounds.minRow + Math.floor((size - contentHeight - 2) / 2);
  const colOffset = 1 - bounds.minCol + Math.floor((size - contentWidth - 2) / 2);
  const normalized = drafts.map((placement) => ({
    ...placement,
    row: placement.row + rowOffset,
    col: placement.col + colOffset,
  }));
  const ordered = [...normalized].sort((left, right) => left.row - right.row || left.col - right.col || (left.direction === "across" ? -1 : 1));
  const clueNumbers = new Map<string, number>();
  let nextClueNumber = 1;
  const placements: PuzzlePlacement[] = ordered.map((placement) => {
    const startKey = getCellKey(placement.row, placement.col);
    if (!clueNumbers.has(startKey)) {
      clueNumbers.set(startKey, nextClueNumber);
      nextClueNumber += 1;
    }

    return {
      wordId: placement.word.id,
      row: placement.row,
      col: placement.col,
      direction: placement.direction,
      clueNumber: clueNumbers.get(startKey)!,
    };
  });
  const cellMap = new Map<string, PuzzleBoardCell>();

  for (const placement of placements) {
    const draft = normalized.find((entry) => entry.word.id === placement.wordId)!;
    for (const [index, cell] of getPlacementCells(draft).entries()) {
      const key = getCellKey(cell.row, cell.col);
      const existing = cellMap.get(key);
      if (existing) {
        existing.wordIds.push(placement.wordId);
        if (index === 0) {
          existing.clueNumbers.push(placement.clueNumber);
        }
      } else {
        cellMap.set(key, {
          row: cell.row,
          col: cell.col,
          solution: cell.letter,
          clueNumbers: index === 0 ? [placement.clueNumber] : [],
          wordIds: [placement.wordId],
        });
      }
    }
  }

  return {
    size,
    placements,
    cells: [...cellMap.values()].sort((left, right) => left.row - right.row || left.col - right.col),
  };
}

export function buildConnectedCrossword(candidates: PuzzleWord[], targetSize: number, seed: string) {
  const uniqueCandidates = candidates.filter((word, index, words) => words.findIndex((candidate) => candidate.normalized === word.normalized) === index);
  let visitedNodes = 0;

  function search(placements: DraftPlacement[], usedIds: Set<string>): DraftPlacement[] | null {
    visitedNodes += 1;
    if (visitedNodes > maximumSearchNodes) {
      return null;
    }
    if (placements.length === targetSize) {
      return placements;
    }

    const transitions = uniqueCandidates
      .filter((word) => !usedIds.has(word.id) && cluesAreCompatible(placements, word))
      .flatMap((word, candidateIndex) => getCrosswordPlacements(placements, word).map((option) => ({
        ...option,
        word,
        candidateIndex,
        tie: hashString(`${seed}:${placements.length}:${word.id}:${option.placement.row}:${option.placement.col}:${option.placement.direction}`),
      })))
      .sort((left, right) => right.intersections - left.intersections
        || left.area - right.area
        || left.candidateIndex - right.candidateIndex
        || left.tie - right.tie)
      .slice(0, 240);

    for (const transition of transitions) {
      const nextUsed = new Set(usedIds);
      nextUsed.add(transition.word.id);
      const result = search([...placements, transition.placement], nextUsed);
      if (result) {
        return result;
      }
    }

    return null;
  }

  for (const firstWord of uniqueCandidates.slice(0, 24)) {
    const firstPlacement = getCrosswordPlacements([], firstWord)[0].placement;
    const result = search([firstPlacement], new Set([firstWord.id]));
    if (result) {
      const selectedIds = new Set(result.map((placement) => placement.word.id));
      return {
        words: uniqueCandidates.filter((word) => selectedIds.has(word.id)),
        board: numberAndNormalizePlacements(result),
      };
    }
  }

  return null;
}

export function buildQuestBoard(words: PuzzleWord[], seed: string): PuzzleBoardV3 {
  const size = 14;
  const rowOrder = Array.from({ length: size }, (_, row) => row)
    .sort((left, right) => hashString(`${seed}:row:${left}`) - hashString(`${seed}:row:${right}`));
  const placements = words.map((word, index): PuzzlePlacement => {
    const row = rowOrder[index];
    const availableColumns = size - word.length + 1;
    const col = availableColumns > 1 ? hashString(`${seed}:col:${word.id}`) % availableColumns : 0;
    return { wordId: word.id, row, col, direction: "across", clueNumber: index + 1 };
  });
  const cells: PuzzleBoardCell[] = [];

  for (const placement of placements) {
    const word = words.find((candidate) => candidate.id === placement.wordId)!;
    for (let index = 0; index < word.answer.length; index += 1) {
      cells.push({
        row: placement.row,
        col: placement.col + index,
        solution: word.answer[index],
        clueNumbers: index === 0 ? [placement.clueNumber] : [],
        wordIds: [word.id],
      });
    }
  }

  return { size, placements, cells: cells.sort((left, right) => left.row - right.row || left.col - right.col) };
}
