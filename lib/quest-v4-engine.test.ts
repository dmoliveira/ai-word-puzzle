import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildPuzzleRun } from "@/lib/puzzle-generator";
import {
  certifyQuestV4Board,
  findQuestV4Occurrences,
  generateQuestV4,
  getQuestV4PathKey,
  questV4DefaultBudgets,
  questV4Size,
  type QuestV4Board,
  type QuestV4Delta,
  type QuestV4GenerationInput,
  type QuestV4Path,
  type QuestV4Target,
} from "@/lib/quest-v4-engine";
import { contentCatalog, topicCatalog } from "@/lib/word-bank";

const corpusRevision = "word-bank-test-v1";
const baseTargets = ["mercury", "saturn", "orbit", "comet", "galaxy", "meteor", "nebula", "eclipse"]
  .map((answer, index) => ({ id: `word-${index}`, answer }));

function inputFor(seed: string, targets: readonly QuestV4Target[] = baseTargets): QuestV4GenerationInput {
  return { seed, corpusRevision, contentIdentity: `classic:quest:${targets.length}`, targets };
}

function requireBoard(input: QuestV4GenerationInput) {
  const result = generateQuestV4(input);
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result;
}

function mutableBoard(board: QuestV4Board) {
  return {
    ...board,
    grid: [...board.grid],
    paths: board.paths.map((path) => ({ ...path })),
  };
}

function pathCells(path: QuestV4Path, length: number) {
  return Array.from({ length }, (_, offset) => ({
    row: path.row + path.deltaRow * offset,
    col: path.col + path.deltaCol * offset,
  }));
}

function assertCertified(board: QuestV4Board, targets: readonly QuestV4Target[]) {
  assert.equal(board.kind, "quest-v4");
  assert.equal(board.generatorVersion, 4);
  assert.equal(board.size, questV4Size);
  assert.equal(board.grid.length, questV4Size);
  assert.ok(board.grid.every((row) => /^[a-z]{14}$/.test(row)));
  assert.equal(board.paths.length, targets.length);
  for (const [index, target] of targets.entries()) {
    const path = board.paths[index];
    assert.equal(path.wordId, target.id);
    assert.notDeepEqual([path.deltaRow, path.deltaCol], [0, 0]);
    const cells = pathCells(path, target.answer.length);
    assert.ok(cells.every((cell) => cell.row >= 0 && cell.row < questV4Size && cell.col >= 0 && cell.col < questV4Size));
    assert.equal(cells.map((cell) => board.grid[cell.row][cell.col]).join(""), target.answer);
    const occurrences = findQuestV4Occurrences(board.grid, target.answer);
    assert.equal(occurrences.length, 1, `${target.answer} must occur exactly once`);
    assert.equal(occurrences[0].key, getQuestV4PathKey(path, target.answer.length));
  }
  assert.deepEqual(certifyQuestV4Board(board, targets).ok, true);

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
  assert.equal(board.fingerprint, `q4-${createHash("sha256").update(payload).digest("hex")}`);
}

function gridWithPath(answer: string, row: number, col: number, deltaRow: QuestV4Delta, deltaCol: QuestV4Delta) {
  const grid = Array.from({ length: questV4Size }, () => Array(questV4Size).fill("q"));
  for (let offset = 0; offset < answer.length; offset += 1) {
    grid[row + deltaRow * offset][col + deltaCol * offset] = answer[offset];
  }
  return grid.map((gridRow) => gridRow.join(""));
}

test("the occurrence scanner covers all eight signed vectors", () => {
  const answer = "orbit";
  const vectors = [
    [-1, -1], [-1, 0], [-1, 1], [0, -1],
    [0, 1], [1, -1], [1, 0], [1, 1],
  ] as const;
  for (const [deltaRow, deltaCol] of vectors) {
    const row = deltaRow < 0 ? 10 : deltaRow > 0 ? 2 : 6;
    const col = deltaCol < 0 ? 10 : deltaCol > 0 ? 2 : 6;
    const occurrences = findQuestV4Occurrences(gridWithPath(answer, row, col, deltaRow, deltaCol), answer);
    assert.deepEqual(occurrences, [{ row, col, deltaRow, deltaCol, key: occurrences[0]?.key }]);
  }
});

test("the occurrence scanner deduplicates palindromes and reports duplicate geometry", () => {
  const palindromeGrid = gridWithPath("level", 2, 2, 1, 1);
  assert.equal(findQuestV4Occurrences(palindromeGrid, "level").length, 1);

  const duplicate = palindromeGrid.map((row) => [...row]);
  for (const [index, letter] of [..."level"].entries()) duplicate[10][index + 2] = letter;
  assert.equal(findQuestV4Occurrences(duplicate.map((row) => row.join("")), "level").length, 2);
});

test("generation is deterministic, immutable, fully filled, and independently certified", () => {
  const input = inputFor("deterministic-v4");
  const before = structuredClone(input);
  const left = requireBoard(input);
  const right = requireBoard(input);

  assert.deepEqual(left, right);
  assert.deepEqual(input, before);
  assert.ok(left.layoutNodes <= questV4DefaultBudgets.layoutNodes);
  assert.ok(left.fillNodes <= questV4DefaultBudgets.fillNodes);
  assert.equal(left.board.fingerprint, "q4-7730a2197bc0a1550978755f8a17dc0d23ef770c0331d0b5e0c00969ea4535b1");
  assertCertified(left.board, baseTargets);
});

for (const scenario of [
  { name: "too few targets", input: { ...inputFor("invalid"), targets: baseTargets.slice(0, 3) } },
  { name: "too many targets", input: { ...inputFor("invalid"), targets: Array.from({ length: 13 }, (_, index) => ({ id: `id-${index}`, answer: `word${index}` })) } },
  { name: "duplicate ids", input: { ...inputFor("invalid"), targets: baseTargets.map((target, index) => ({ ...target, id: index < 2 ? "same" : target.id })) } },
  { name: "duplicate answers", input: { ...inputFor("invalid"), targets: baseTargets.map((target, index) => ({ ...target, answer: index < 2 ? "same" : target.answer })) } },
  { name: "short answer", input: { ...inputFor("invalid"), targets: baseTargets.map((target, index) => index === 0 ? { ...target, answer: "ab" } : target) } },
  { name: "long answer", input: { ...inputFor("invalid"), targets: baseTargets.map((target, index) => index === 0 ? { ...target, answer: "abcdefghijklmno" } : target) } },
  { name: "uppercase answer", input: { ...inputFor("invalid"), targets: baseTargets.map((target, index) => index === 0 ? { ...target, answer: "Orbit" } : target) } },
  { name: "empty identity", input: { ...inputFor("invalid"), contentIdentity: "" } },
  { name: "invalid budget", input: { ...inputFor("invalid"), budgets: { layoutNodes: questV4DefaultBudgets.layoutNodes + 1 } } },
]) {
  test(`invalid contract is explicit: ${scenario.name}`, () => {
    const result = generateQuestV4(scenario.input);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "invalid-input");
    assert.equal(result.layoutNodes, 0);
    assert.equal(result.fillNodes, 0);
  });
}

test("layout and fill budgets fail explicitly without a partial board", () => {
  const layoutFailure = generateQuestV4({ ...inputFor("layout-budget"), budgets: { layoutNodes: 1 } });
  assert.equal(layoutFailure.ok, false);
  if (!layoutFailure.ok) assert.equal(layoutFailure.code, "layout-budget-exhausted");

  const fillFailure = generateQuestV4({ ...inputFor("fill-budget"), budgets: { fillNodes: 1 } });
  assert.equal(fillFailure.ok, false);
  if (!fillFailure.ok) assert.equal(fillFailure.code, "fill-budget-exhausted");
});

test("an unavoidable duplicate target returns deterministic explicit failure", () => {
  const targets = ["abaxaba", "aba", "planet", "cosmos"].map((answer, index) => ({ id: `duplicate-${index}`, answer }));
  const left = generateQuestV4(inputFor("unavoidable-duplicate", targets));
  const right = generateQuestV4(inputFor("unavoidable-duplicate", targets));
  assert.deepEqual(left, right);
  assert.equal(left.ok, false);
  if (!left.ok) assert.equal(left.code, "unavoidable-duplicate");
});

test("containment, reverse pairs, palindromes, and boundary lengths remain certifiable", () => {
  const targets = ["frostbound", "moonfrost", "frost", "stressed", "desserts", "level", "abcdefghijklmn", "cat"]
    .map((answer, index) => ({ id: `adversarial-${index}`, answer }));
  const { board } = requireBoard(inputFor("adversarial-v4", targets));
  assertCertified(board, targets);
  assert.equal(board.fingerprint, "q4-c4f1f8028cddbb4a46150581170bf260cd412baa19dd243703c6ba171f208bcf");

  const frostCells = new Set(pathCells(board.paths[2], targets[2].answer.length).map((cell) => `${cell.row}:${cell.col}`));
  for (const containerIndex of [0, 1]) {
    const containerCells = new Set(pathCells(board.paths[containerIndex], targets[containerIndex].answer.length).map((cell) => `${cell.row}:${cell.col}`));
    assert.ok([...frostCells].every((cell) => containerCells.has(cell)));
  }
  assert.equal(getQuestV4PathKey(board.paths[3], targets[3].answer.length), getQuestV4PathKey(board.paths[4], targets[4].answer.length));
});

test("certification rejects grid, path, profile, and fingerprint mutations", () => {
  const { board } = requireBoard(inputFor("mutation-v4"));
  const target = baseTargets[0];
  const path = board.paths[0];
  const firstCell = pathCells(path, target.answer.length)[0];

  const gridMutation = mutableBoard(board);
  const row = [...gridMutation.grid[firstCell.row]];
  row[firstCell.col] = row[firstCell.col] === "z" ? "y" : "z";
  gridMutation.grid[firstCell.row] = row.join("");
  assert.equal(certifyQuestV4Board(gridMutation, baseTargets).ok, false);

  const duplicateMutation = mutableBoard(board);
  const intendedKey = getQuestV4PathKey(path, target.answer.length);
  const duplicateRow = intendedKey === `0:${target.answer.length - 1}` ? 1 : 0;
  const duplicateLetters = [...duplicateMutation.grid[duplicateRow]];
  for (const [index, letter] of [...target.answer].entries()) duplicateLetters[index] = letter;
  duplicateMutation.grid[duplicateRow] = duplicateLetters.join("");
  assert.equal(certifyQuestV4Board(duplicateMutation, baseTargets).ok, false);

  const pathMutation = mutableBoard(board);
  pathMutation.paths[0].deltaRow = 0;
  pathMutation.paths[0].deltaCol = 0;
  assert.equal(certifyQuestV4Board(pathMutation, baseTargets).ok, false);

  const profileMutation = mutableBoard(board);
  profileMutation.algorithmProfile = "future-profile";
  assert.equal(certifyQuestV4Board(profileMutation, baseTargets).ok, false);

  const fingerprintMutation = mutableBoard(board);
  fingerprintMutation.fingerprint = `${board.fingerprint.slice(0, -1)}${board.fingerprint.endsWith("0") ? "1" : "0"}`;
  assert.equal(certifyQuestV4Board(fingerprintMutation, baseTargets).ok, false);
});

test("the hidden Quest v4 matrix certifies every return and freezes explicit impossibility", () => {
  const challenges = ["breeze", "quest", "mythic"] as const;
  const matrixSeedCount = Number(process.env.GENERATOR_MATRIX_SEEDS ?? 2);
  const seenVectors = new Set<string>();
  const explicitFailures: string[] = [];
  let maxLayoutNodes = 0;
  let maxFillNodes = 0;

  for (const topic of topicCatalog) {
    for (const challenge of challenges) {
      for (const puzzleSize of [4, 8, 12]) {
        for (let seedIndex = 0; seedIndex < matrixSeedCount; seedIndex += 1) {
          const seed = `quest-v4-${topic.id}-${challenge}-${puzzleSize}-${seedIndex}`;
          const run = buildPuzzleRun(
            { mode: "custom", seed, topics: [topic.id], challenge, puzzleSize, boardView: "quest" },
            Date.now(),
            { generatorVersion: 3 },
          );
          const targets = run.words.map((word) => ({ id: word.id, answer: word.normalized }));
          const input = {
            seed: run.seed,
            corpusRevision,
            contentIdentity: `${topic.id}:${challenge}:classic:${puzzleSize}`,
            targets,
          };
          const generated = generateQuestV4(input);
          if (!generated.ok) {
            assert.equal(generated.code, "unavoidable-duplicate");
            assert.deepEqual(generated, generateQuestV4(input));
            explicitFailures.push(`${seed}:${generated.code}`);
            continue;
          }
          const result = generated;
          assertCertified(result.board, targets);
          maxLayoutNodes = Math.max(maxLayoutNodes, result.layoutNodes);
          maxFillNodes = Math.max(maxFillNodes, result.fillNodes);
          for (const path of result.board.paths) seenVectors.add(`${path.deltaRow}:${path.deltaCol}`);
        }
      }
    }
  }

  assert.equal(seenVectors.size, 8);
  assert.ok(maxLayoutNodes < questV4DefaultBudgets.layoutNodes);
  assert.ok(maxFillNodes < questV4DefaultBudgets.fillNodes);
  assert.deepEqual(explicitFailures, [
    { seedIndex: 19, value: "quest-v4-winter-quest-12-19:unavoidable-duplicate" },
    { seedIndex: 7, value: "quest-v4-greek-breeze-12-7:unavoidable-duplicate" },
    { seedIndex: 25, value: "quest-v4-greek-breeze-12-25:unavoidable-duplicate" },
    { seedIndex: 29, value: "quest-v4-greek-breeze-12-29:unavoidable-duplicate" },
  ].filter((entry) => entry.seedIndex < matrixSeedCount).map((entry) => entry.value));
});

test("every themed content pack is certified or fails explicitly when exact occurrence is impossible", () => {
  const unavoidablePacks: string[] = [];
  for (const pack of contentCatalog) {
    const puzzleSize = Math.min(12, pack.answers.length);
    const seed = `quest-v4-pack-${pack.id}`;
    const run = buildPuzzleRun({
      mode: "custom",
      seed,
      topics: [pack.topicId],
      puzzleFamily: "themed",
      contentPackId: pack.id,
      puzzleSize,
      boardView: "quest",
    }, Date.now(), { generatorVersion: 3 });
    const targets = run.words.map((word) => ({ id: word.id, answer: word.normalized }));
    const input = { seed: run.seed, corpusRevision, contentIdentity: `themed:${pack.id}:${puzzleSize}`, targets };
    const result = generateQuestV4(input);
    if (!result.ok) {
      assert.equal(result.code, "unavoidable-duplicate");
      assert.deepEqual(result, generateQuestV4(input));
      unavoidablePacks.push(pack.id);
    } else {
      assertCertified(result.board, targets);
    }
  }
  assert.deepEqual(unavoidablePacks, ["winter-weather"]);
});
