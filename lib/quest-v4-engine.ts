import { sha256Hex } from "@/lib/sha256";

export const questV4Size = 14 as const;
export const questV4GeneratorVersion = 4 as const;
export const questV4DefaultBudgets = {
  layoutNodes: 25_000,
  fillNodes: 100_000,
} as const;

const algorithmProfile = "quest-v4-csp-1:layout-25000:fill-100000";
const alphabet = [..."abcdefghijklmnopqrstuvwxyz"];

export type QuestV4Delta = -1 | 0 | 1;

export type QuestV4Target = {
  id: string;
  answer: string;
};

export type QuestV4Path = {
  wordId: string;
  row: number;
  col: number;
  deltaRow: QuestV4Delta;
  deltaCol: QuestV4Delta;
};

export type QuestV4Board = {
  kind: "quest-v4";
  generatorVersion: 4;
  algorithmProfile: string;
  size: 14;
  seed: string;
  corpusRevision: string;
  contentIdentity: string;
  grid: readonly string[];
  paths: readonly QuestV4Path[];
  fingerprint: string;
};

export type QuestV4FailureCode =
  | "invalid-input"
  | "unavoidable-duplicate"
  | "layout-budget-exhausted"
  | "layout-unsatisfiable"
  | "fill-budget-exhausted"
  | "fill-unsatisfiable"
  | "certification-failed";

export type QuestV4GenerationResult =
  | {
    ok: true;
    board: QuestV4Board;
    layoutNodes: number;
    fillNodes: number;
  }
  | {
    ok: false;
    code: QuestV4FailureCode;
    message: string;
    layoutNodes: number;
    fillNodes: number;
  };

export type QuestV4Occurrence = {
  row: number;
  col: number;
  deltaRow: QuestV4Delta;
  deltaCol: QuestV4Delta;
  key: string;
};

export type QuestV4Certification =
  | { ok: true; occurrenceKeys: Readonly<Record<string, string>> }
  | { ok: false; issues: readonly string[] };

export type QuestV4Budgets = {
  layoutNodes: number;
  fillNodes: number;
};

export type QuestV4GenerationInput = {
  seed: string;
  corpusRevision: string;
  contentIdentity: string;
  targets: readonly QuestV4Target[];
  budgets?: Partial<QuestV4Budgets>;
};

type Direction = readonly [QuestV4Delta, QuestV4Delta];
type Geometry = {
  row: number;
  col: number;
  deltaRow: QuestV4Delta;
  deltaCol: QuestV4Delta;
  directionIndex: number;
  cells: readonly number[];
  key: string;
};
type OrderedTarget = QuestV4Target & { originalIndex: number };
type FillConstraint = { cells: readonly number[]; pattern: string };
type SearchStatus = "success" | "exhausted" | "budget";

const directions = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const satisfies readonly Direction[];

const canonicalDirections = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const satisfies readonly Direction[];

const directedGeometryCache = new Map<number, readonly Geometry[]>();
const undirectedGeometryCache = new Map<number, readonly Geometry[]>();

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareCodePoints(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function indexFor(row: number, col: number) {
  return row * questV4Size + col;
}

function coordinatesFor(index: number) {
  return { row: Math.floor(index / questV4Size), col: index % questV4Size };
}

function inBounds(row: number, col: number) {
  return row >= 0 && row < questV4Size && col >= 0 && col < questV4Size;
}

function canonicalPathKey(cells: readonly number[]) {
  const first = cells[0];
  const last = cells[cells.length - 1];
  return first < last ? `${first}:${last}` : `${last}:${first}`;
}

function buildGeometry(length: number, allowedDirections: readonly Direction[]) {
  const geometries: Geometry[] = [];
  for (const [directionIndex, [deltaRow, deltaCol]] of allowedDirections.entries()) {
    for (let row = 0; row < questV4Size; row += 1) {
      for (let col = 0; col < questV4Size; col += 1) {
        const endRow = row + deltaRow * (length - 1);
        const endCol = col + deltaCol * (length - 1);
        if (!inBounds(endRow, endCol)) {
          continue;
        }
        const cells = Array.from({ length }, (_, offset) => indexFor(row + deltaRow * offset, col + deltaCol * offset));
        geometries.push({ row, col, deltaRow, deltaCol, directionIndex, cells, key: canonicalPathKey(cells) });
      }
    }
  }
  return geometries;
}

function getDirectedGeometries(length: number) {
  const cached = directedGeometryCache.get(length);
  if (cached) return cached;
  const geometries = buildGeometry(length, directions);
  directedGeometryCache.set(length, geometries);
  return geometries;
}

function getUndirectedGeometries(length: number) {
  const cached = undirectedGeometryCache.get(length);
  if (cached) return cached;
  const geometries = buildGeometry(length, canonicalDirections);
  undirectedGeometryCache.set(length, geometries);
  return geometries;
}

function readGeometry(grid: readonly (string | null)[], cells: readonly number[]) {
  let value = "";
  for (const cell of cells) {
    const letter = grid[cell];
    if (letter === null) return null;
    value += letter;
  }
  return value;
}

function occurrenceFromGeometry(geometry: Geometry, reversed: boolean): QuestV4Occurrence {
  if (!reversed) {
    return {
      row: geometry.row,
      col: geometry.col,
      deltaRow: geometry.deltaRow,
      deltaCol: geometry.deltaCol,
      key: geometry.key,
    };
  }
  const last = coordinatesFor(geometry.cells[geometry.cells.length - 1]);
  const deltaRow = geometry.deltaRow === 0 ? 0 : -geometry.deltaRow as QuestV4Delta;
  const deltaCol = geometry.deltaCol === 0 ? 0 : -geometry.deltaCol as QuestV4Delta;
  return {
    row: last.row,
    col: last.col,
    deltaRow,
    deltaCol,
    key: geometry.key,
  };
}

function findOccurrencesInCells(grid: readonly (string | null)[], answer: string) {
  const reverse = [...answer].reverse().join("");
  const occurrences = new Map<string, QuestV4Occurrence>();
  for (const geometry of getUndirectedGeometries(answer.length)) {
    const value = readGeometry(grid, geometry.cells);
    if (value === answer) {
      occurrences.set(geometry.key, occurrenceFromGeometry(geometry, false));
    } else if (value === reverse) {
      occurrences.set(geometry.key, occurrenceFromGeometry(geometry, true));
    }
  }
  return occurrences;
}

function rowsToCells(grid: readonly string[]) {
  return grid.flatMap((row) => [...row]);
}

export function findQuestV4Occurrences(grid: readonly string[], answer: string) {
  if (grid.length !== questV4Size || grid.some((row) => !new RegExp(`^[a-z]{${questV4Size}}$`).test(row)) || !/^[a-z]{3,14}$/.test(answer)) {
    return [] as QuestV4Occurrence[];
  }
  return [...findOccurrencesInCells(rowsToCells(grid), answer).values()];
}

export function getQuestV4PathKey(path: QuestV4Path, length: number) {
  const cells = Array.from({ length }, (_, offset) => indexFor(path.row + path.deltaRow * offset, path.col + path.deltaCol * offset));
  return canonicalPathKey(cells);
}

function validateInput(input: QuestV4GenerationInput) {
  if (typeof input.seed !== "string" || input.seed.length === 0 || input.seed.length > 256) {
    return "Seed must contain 1–256 characters.";
  }
  if (typeof input.corpusRevision !== "string" || input.corpusRevision.length === 0 || input.corpusRevision.length > 128) {
    return "Corpus revision must contain 1–128 characters.";
  }
  if (typeof input.contentIdentity !== "string" || input.contentIdentity.length === 0 || input.contentIdentity.length > 512) {
    return "Content identity must contain 1–512 characters.";
  }
  if (!Array.isArray(input.targets) || input.targets.length < 4 || input.targets.length > 12) {
    return "Quest v4 requires 4–12 targets.";
  }
  const ids = new Set<string>();
  const answers = new Set<string>();
  for (const target of input.targets) {
    if (!target || typeof target.id !== "string" || target.id.length === 0 || target.id.length > 128) {
      return "Every target requires a bounded non-empty id.";
    }
    if (!/^[a-z]{3,14}$/.test(target.answer)) {
      return `Target ${target.id} must be 3–14 lowercase ASCII letters.`;
    }
    if (ids.has(target.id) || answers.has(target.answer)) {
      return "Target ids and answers must be unique.";
    }
    ids.add(target.id);
    answers.add(target.answer);
  }
  for (const [key, maximum] of Object.entries(questV4DefaultBudgets) as Array<[keyof QuestV4Budgets, number]>) {
    const value = input.budgets?.[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > maximum)) {
      return `${key} must be an integer between 1 and ${maximum}.`;
    }
  }
  return null;
}

function resolveBudget(input: QuestV4GenerationInput, key: keyof QuestV4Budgets) {
  return input.budgets?.[key] ?? questV4DefaultBudgets[key];
}

function orderTargets(targets: readonly QuestV4Target[], seed: string) {
  const indexed = targets.map((target, originalIndex): OrderedTarget => ({ ...target, originalIndex }));
  const parents = indexed.map((_, index) => index);
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]));
  const unite = (left: number, right: number) => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot !== rightRoot) parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  for (let left = 0; left < indexed.length; left += 1) {
    for (let right = left + 1; right < indexed.length; right += 1) {
      const leftAnswer = indexed[left].answer;
      const rightAnswer = indexed[right].answer;
      const leftReverse = [...leftAnswer].reverse().join("");
      const rightReverse = [...rightAnswer].reverse().join("");
      if (leftAnswer.includes(rightAnswer) || leftAnswer.includes(rightReverse)
        || rightAnswer.includes(leftAnswer) || rightAnswer.includes(leftReverse)) {
        unite(left, right);
      }
    }
  }
  const groups = new Map<number, OrderedTarget[]>();
  for (const [index, target] of indexed.entries()) {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), target]);
  }
  const compareTargets = (left: OrderedTarget, right: OrderedTarget) => right.answer.length - left.answer.length
      || hashString(`${seed}:target:${left.id}`) - hashString(`${seed}:target:${right.id}`)
      || compareCodePoints(left.answer, right.answer)
      || compareCodePoints(left.id, right.id)
      || left.originalIndex - right.originalIndex;
  return [...groups.values()]
    .map((group) => ({
      targets: group.sort(compareTargets),
      maxLength: Math.max(...group.map((target) => target.answer.length)),
      key: [...group].map((target) => target.id).sort(compareCodePoints).join("|"),
    }))
    .sort((left, right) => right.maxLength - left.maxLength
      || hashString(`${seed}:component:${left.key}`) - hashString(`${seed}:component:${right.key}`)
      || compareCodePoints(left.key, right.key))
    .flatMap((group) => group.targets);
}

function orderedGeometries(target: OrderedTarget, depth: number, seed: string) {
  const preferredDirection = hashString(`${seed}:direction:${depth}:${target.id}`) % directions.length;
  return getDirectedGeometries(target.answer.length)
    .map((geometry) => ({
      geometry,
      directionRank: (geometry.directionIndex - preferredDirection + directions.length) % directions.length,
      rank: hashString(`${seed}:path:${target.id}:${geometry.row}:${geometry.col}:${geometry.deltaRow}:${geometry.deltaCol}`),
    }))
    .sort((left, right) => left.directionRank - right.directionRank
      || left.rank - right.rank
      || left.geometry.row - right.geometry.row
      || left.geometry.col - right.geometry.col)
    .map(({ geometry }) => geometry);
}

function tryApplyGeometry(grid: (string | null)[], geometry: Geometry, answer: string) {
  for (const [index, cell] of geometry.cells.entries()) {
    const current = grid[cell];
    if (current !== null && current !== answer[index]) {
      return null;
    }
  }
  const changed: number[] = [];
  for (const [index, cell] of geometry.cells.entries()) {
    if (grid[cell] === null) {
      grid[cell] = answer[index];
      changed.push(cell);
    }
  }
  return changed;
}

function getCompatibleOverlap(grid: readonly (string | null)[], geometry: Geometry, answer: string) {
  let overlap = 0;
  for (const [index, cell] of geometry.cells.entries()) {
    if (grid[cell] !== null && grid[cell] !== answer[index]) return null;
    if (grid[cell] === answer[index]) overlap += 1;
  }
  return overlap;
}

function substringOffsets(value: string, search: string) {
  const offsets: number[] = [];
  for (let offset = value.indexOf(search); offset !== -1; offset = value.indexOf(search, offset + 1)) {
    offsets.push(offset);
  }
  return offsets;
}

function getContainmentChoices(container: QuestV4Target, motif: QuestV4Target) {
  const reverse = [...motif.answer].reverse().join("");
  const directOffsets = substringOffsets(container.answer, motif.answer);
  const reverseOffsets = substringOffsets(container.answer, reverse);
  const offsets = [...new Set([...directOffsets, ...reverseOffsets])];
  if (offsets.length === 0) return { choices: [] as Array<Map<number, string>>, duplicate: false };
  if (offsets.length > 1) return { choices: [] as Array<Map<number, string>>, duplicate: true };
  const offset = offsets[0];
  const choices: Array<Map<number, string>> = [];
  if (directOffsets.includes(offset)) {
    choices.push(new Map([...container.answer].map((letter, index) => [index - offset, letter])));
  }
  if (reverseOffsets.includes(offset)) {
    choices.push(new Map([...container.answer].map((letter, index) => [offset + motif.answer.length - 1 - index, letter])));
  }
  const unique = new Map(choices.map((choice) => [[...choice].sort((left, right) => left[0] - right[0]).map(([position, letter]) => `${position}:${letter}`).join("|"), choice]));
  return { choices: [...unique.values()], duplicate: false };
}

function findUnavoidableDuplicate(targets: readonly QuestV4Target[]) {
  for (const motif of targets) {
    const containers = targets
      .map((container) => ({ container, ...getContainmentChoices(container, motif) }))
      .filter((entry) => entry.choices.length > 0 || entry.duplicate);
    if (containers.some((entry) => entry.duplicate)) return motif;
    if (containers.length < 2) continue;

    function align(index: number, letters: Map<number, string>): boolean {
      if (index === containers.length) {
        const positions = [...letters.keys()];
        return Math.max(...positions) - Math.min(...positions) + 1 <= questV4Size;
      }
      for (const choice of containers[index].choices) {
        if ([...choice].some(([position, letter]) => letters.has(position) && letters.get(position) !== letter)) continue;
        const next = new Map(letters);
        for (const [position, letter] of choice) next.set(position, letter);
        if (align(index + 1, next)) return true;
      }
      return false;
    }

    if (!align(0, new Map())) return motif;
  }
  return null;
}

function getExistingMotifs(grid: readonly (string | null)[], target: OrderedTarget, targets: readonly QuestV4Target[]) {
  return targets.flatMap((motif) => {
    if (motif.id === target.id || motif.answer.length > target.answer.length) return [];
    const reverse = [...motif.answer].reverse().join("");
    const offsets = [...new Set([
      ...substringOffsets(target.answer, motif.answer),
      ...substringOffsets(target.answer, reverse),
    ])];
    if (offsets.length === 0) return [];
    const occurrences = findOccurrencesInCells(grid, motif.answer);
    if (occurrences.size !== 1) return [];
    return [{ key: occurrences.keys().next().value as string, length: motif.answer.length, offsets }];
  });
}

function getMotifScore(geometry: Geometry, motifs: ReturnType<typeof getExistingMotifs>) {
  return motifs.reduce((score, motif) => {
    const aligned = motif.offsets.some((offset) => canonicalPathKey(geometry.cells.slice(offset, offset + motif.length)) === motif.key);
    return score + (aligned ? motif.length : 0);
  }, 0);
}

function undoCells(grid: (string | null)[], changed: readonly number[]) {
  for (const cell of changed) grid[cell] = null;
}

function pathFromGeometry(target: OrderedTarget, geometry: Geometry): QuestV4Path {
  return {
    wordId: target.id,
    row: geometry.row,
    col: geometry.col,
    deltaRow: geometry.deltaRow,
    deltaCol: geometry.deltaCol,
  };
}

function placedPathsAreExact(grid: readonly (string | null)[], ordered: readonly OrderedTarget[], paths: readonly (QuestV4Path | null)[]) {
  for (const target of ordered) {
    const path = paths[target.originalIndex];
    const occurrences = findOccurrencesInCells(grid, target.answer);
    if (!path) {
      if (occurrences.size > 1) return false;
      continue;
    }
    if (occurrences.size !== 1 || !occurrences.has(getQuestV4PathKey(path, target.answer.length))) {
      return false;
    }
  }
  return true;
}

function buildLayout(input: QuestV4GenerationInput, nodeLimit: number) {
  const grid = Array<string | null>(questV4Size * questV4Size).fill(null);
  const ordered = orderTargets(input.targets, input.seed);
  const paths = Array<QuestV4Path | null>(input.targets.length).fill(null);
  const candidates = new Map(ordered.map((target, depth) => [target.originalIndex, orderedGeometries(target, depth, input.seed)]));
  let nodes = 0;

  function search(depth: number): SearchStatus {
    if (depth === ordered.length) return "success";
    const target = ordered[depth];
    const existing = findOccurrencesInCells(grid, target.answer);
    if (existing.size > 1) return "exhausted";
    const requiredKey = existing.size === 1 ? existing.keys().next().value as string : null;
    const motifs = getExistingMotifs(grid, target, input.targets);
    const requiredMotifScore = motifs.reduce((total, motif) => total + motif.length, 0);

    const viable: Array<{ geometry: Geometry; order: number; overlap: number }> = [];
    for (const [order, geometry] of (candidates.get(target.originalIndex) ?? []).entries()) {
      if (nodes >= nodeLimit) return "budget";
      nodes += 1;
      if (requiredKey && geometry.key !== requiredKey) continue;
      const overlap = getCompatibleOverlap(grid, geometry, target.answer);
      if (overlap === null) continue;
      if (getMotifScore(geometry, motifs) !== requiredMotifScore) continue;
      viable.push({ geometry, order, overlap });
    }
    viable.sort((left, right) => left.overlap - right.overlap || left.order - right.order);
    for (const { geometry } of viable) {
      const changed = tryApplyGeometry(grid, geometry, target.answer);
      if (!changed) continue;
      paths[target.originalIndex] = pathFromGeometry(target, geometry);
      if (placedPathsAreExact(grid, ordered, paths)) {
        const status = search(depth + 1);
        if (status === "success") return status;
        if (status === "budget") {
          paths[target.originalIndex] = null;
          undoCells(grid, changed);
          return status;
        }
      }
      paths[target.originalIndex] = null;
      undoCells(grid, changed);
    }
    return "exhausted";
  }

  const status = search(0);
  return {
    status,
    nodes,
    grid,
    paths: status === "success" ? paths as QuestV4Path[] : null,
  };
}

function constraintMatches(grid: readonly (string | null)[], constraint: FillConstraint) {
  return constraint.cells.every((cell, index) => grid[cell] === constraint.pattern[index]);
}

function buildFillConstraints(grid: readonly (string | null)[], targets: readonly QuestV4Target[], paths: readonly QuestV4Path[]) {
  const constraints: FillConstraint[] = [];
  for (const [index, target] of targets.entries()) {
    const intendedKey = getQuestV4PathKey(paths[index], target.answer.length);
    const reverse = [...target.answer].reverse().join("");
    for (const geometry of getUndirectedGeometries(target.answer.length)) {
      if (geometry.key === intendedKey) continue;
      constraints.push({ cells: geometry.cells, pattern: target.answer });
      if (reverse !== target.answer) constraints.push({ cells: geometry.cells, pattern: reverse });
    }
  }

  const constraintsByCell = Array.from({ length: questV4Size * questV4Size }, () => [] as number[]);
  const remaining = constraints.map((constraint, constraintIndex) => {
    let emptyCount = 0;
    for (const cell of constraint.cells) {
      if (grid[cell] === null) {
        emptyCount += 1;
        constraintsByCell[cell].push(constraintIndex);
      }
    }
    return emptyCount;
  });
  const blocked = constraints.some((constraint, index) => remaining[index] === 0 && constraintMatches(grid, constraint));
  return { constraints, constraintsByCell, remaining, blocked };
}

function fillGrid(input: QuestV4GenerationInput, grid: (string | null)[], paths: readonly QuestV4Path[], nodeLimit: number) {
  const prepared = buildFillConstraints(grid, input.targets, paths);
  if (prepared.blocked) return { status: "exhausted" as const, nodes: 0 };
  const fillOrder = grid
    .map((letter, index) => ({ letter, index }))
    .filter((entry) => entry.letter === null)
    .sort((left, right) => prepared.constraintsByCell[right.index].length - prepared.constraintsByCell[left.index].length
      || hashString(`${input.seed}:fill-cell:${left.index}`) - hashString(`${input.seed}:fill-cell:${right.index}`)
      || left.index - right.index)
    .map((entry) => entry.index);
  const letterOrders = new Map(fillOrder.map((cell) => [cell, [...alphabet].sort((left, right) =>
    hashString(`${input.seed}:fill-letter:${cell}:${left}`) - hashString(`${input.seed}:fill-letter:${cell}:${right}`)
    || compareCodePoints(left, right))]));
  let nodes = 0;

  function search(depth: number): SearchStatus {
    if (depth === fillOrder.length) return "success";
    const cell = fillOrder[depth];
    const related = prepared.constraintsByCell[cell];
    for (const letter of letterOrders.get(cell) ?? alphabet) {
      if (nodes >= nodeLimit) return "budget";
      nodes += 1;
      grid[cell] = letter;
      for (const constraintIndex of related) prepared.remaining[constraintIndex] -= 1;
      const violates = related.some((constraintIndex) => prepared.remaining[constraintIndex] === 0
        && constraintMatches(grid, prepared.constraints[constraintIndex]));
      if (!violates) {
        const status = search(depth + 1);
        if (status === "success") return status;
        if (status === "budget") {
          for (const constraintIndex of related) prepared.remaining[constraintIndex] += 1;
          grid[cell] = null;
          return status;
        }
      }
      for (const constraintIndex of related) prepared.remaining[constraintIndex] += 1;
      grid[cell] = null;
    }
    return "exhausted";
  }

  return { status: search(0), nodes };
}

function gridRows(grid: readonly (string | null)[]) {
  return Array.from({ length: questV4Size }, (_, row) => grid.slice(row * questV4Size, (row + 1) * questV4Size).join(""));
}

type FingerprintBoard = Omit<QuestV4Board, "fingerprint">;

export function computeQuestV4Fingerprint(board: FingerprintBoard, targets: readonly QuestV4Target[]) {
  const payload = JSON.stringify([
    "quest-v4-fingerprint-1",
    board.generatorVersion,
    board.algorithmProfile,
    board.size,
    board.seed,
    board.corpusRevision,
    board.contentIdentity,
    targets.map((target) => [target.id, target.answer]),
    board.grid,
    board.paths.map((path) => [path.wordId, path.row, path.col, path.deltaRow, path.deltaCol]),
  ]);
  return `q4-${sha256Hex(payload)}`;
}

function validDelta(delta: number): delta is QuestV4Delta {
  return delta === -1 || delta === 0 || delta === 1;
}

export function certifyQuestV4Board(board: QuestV4Board, targets: readonly QuestV4Target[]): QuestV4Certification {
  const issues: string[] = [];
  if (board.kind !== "quest-v4" || board.generatorVersion !== questV4GeneratorVersion || board.size !== questV4Size) {
    issues.push("board-version-or-size");
  }
  if (board.algorithmProfile !== algorithmProfile) issues.push("algorithm-profile");
  if (validateInput({
    seed: board.seed,
    corpusRevision: board.corpusRevision,
    contentIdentity: board.contentIdentity,
    targets,
  })) issues.push("identity-or-targets");
  const validGrid = Array.isArray(board.grid) && board.grid.length === questV4Size
    && board.grid.every((row) => new RegExp(`^[a-z]{${questV4Size}}$`).test(row));
  if (!validGrid) issues.push("grid-shape");
  const validPathCollection = Array.isArray(board.paths)
    && board.paths.length === targets.length
    && board.paths.every((path) => path && typeof path.wordId === "string"
      && Number.isInteger(path.row) && Number.isInteger(path.col)
      && validDelta(path.deltaRow) && validDelta(path.deltaCol));
  if (!validPathCollection) issues.push("path-count-or-shape");
  const occurrenceKeys: Record<string, string> = {};

  if (validGrid && validPathCollection) {
    for (const [index, target] of targets.entries()) {
      const path = board.paths[index];
      if (!path || path.wordId !== target.id) {
        issues.push(`path-order:${target.id}`);
        continue;
      }
      if ((path.deltaRow === 0 && path.deltaCol === 0) || !inBounds(path.row, path.col)) {
        issues.push(`path-vector:${target.id}`);
        continue;
      }
      const letters: string[] = [];
      let inRange = true;
      for (let offset = 0; offset < target.answer.length; offset += 1) {
        const row = path.row + path.deltaRow * offset;
        const col = path.col + path.deltaCol * offset;
        if (!inBounds(row, col)) {
          inRange = false;
          break;
        }
        letters.push(board.grid[row][col]);
      }
      if (!inRange) {
        issues.push(`path-bounds:${target.id}`);
        continue;
      }
      if (letters.join("") !== target.answer) issues.push(`path-spelling:${target.id}`);
      const occurrences = findQuestV4Occurrences(board.grid, target.answer);
      const intendedKey = getQuestV4PathKey(path, target.answer.length);
      if (occurrences.length !== 1 || occurrences[0]?.key !== intendedKey) {
        issues.push(`occurrence:${target.id}:${occurrences.length}`);
      } else {
        occurrenceKeys[target.id] = intendedKey;
      }
    }
    const expectedFingerprint = computeQuestV4Fingerprint({
      kind: board.kind,
      generatorVersion: board.generatorVersion,
      algorithmProfile: board.algorithmProfile,
      size: board.size,
      seed: board.seed,
      corpusRevision: board.corpusRevision,
      contentIdentity: board.contentIdentity,
      grid: board.grid,
      paths: board.paths,
    }, targets);
    if (expectedFingerprint !== board.fingerprint) issues.push("fingerprint");
  }

  return issues.length === 0 ? { ok: true, occurrenceKeys } : { ok: false, issues };
}

function failure(code: QuestV4FailureCode, message: string, layoutNodes: number, fillNodes: number): QuestV4GenerationResult {
  return { ok: false, code, message, layoutNodes, fillNodes };
}

export function generateQuestV4(input: QuestV4GenerationInput): QuestV4GenerationResult {
  const invalid = validateInput(input);
  if (invalid) return failure("invalid-input", invalid, 0, 0);
  const targets = input.targets.map((target) => ({ ...target }));
  const unavoidable = findUnavoidableDuplicate(targets);
  if (unavoidable) {
    return failure("unavoidable-duplicate", `Target ${unavoidable.id} is forced onto more than one incompatible path.`, 0, 0);
  }
  const normalizedInput = { ...input, targets };
  const layout = buildLayout(normalizedInput, resolveBudget(input, "layoutNodes"));
  if (layout.status === "budget") {
    return failure("layout-budget-exhausted", "Quest v4 exhausted its bounded layout search.", layout.nodes, 0);
  }
  if (layout.status !== "success" || !layout.paths) {
    return failure("layout-unsatisfiable", "Quest v4 could not place every target exactly once.", layout.nodes, 0);
  }
  const filled = fillGrid(normalizedInput, layout.grid, layout.paths, resolveBudget(input, "fillNodes"));
  if (filled.status === "budget") {
    return failure("fill-budget-exhausted", "Quest v4 exhausted its bounded filler search.", layout.nodes, filled.nodes);
  }
  if (filled.status !== "success") {
    return failure("fill-unsatisfiable", "Quest v4 could not fill the grid without a duplicate target.", layout.nodes, filled.nodes);
  }

  const baseBoard: FingerprintBoard = {
    kind: "quest-v4",
    generatorVersion: questV4GeneratorVersion,
    algorithmProfile,
    size: questV4Size,
    seed: input.seed,
    corpusRevision: input.corpusRevision,
    contentIdentity: input.contentIdentity,
    grid: gridRows(layout.grid),
    paths: layout.paths.map((path) => ({ ...path })),
  };
  const board: QuestV4Board = {
    ...baseBoard,
    fingerprint: computeQuestV4Fingerprint(baseBoard, targets),
  };
  const certification = certifyQuestV4Board(board, targets);
  if (!certification.ok) {
    return failure("certification-failed", `Quest v4 certification failed: ${certification.issues.join(", ")}.`, layout.nodes, filled.nodes);
  }
  return { ok: true, board, layoutNodes: layout.nodes, fillNodes: filled.nodes };
}
