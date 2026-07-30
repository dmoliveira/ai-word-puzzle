import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const sessionStorageKey = "astra-lexa:v3";
const pagehideStoragePrefix = "astra-lexa:v3:pagehide:";
const localStorageKeys = [
  sessionStorageKey,
  "astra-lexa:v3:previous",
  "astra-lexa:v3:commit",
  "astra-lexa:v3:import-undo",
  "astra-lexa:v2",
  "astra-lexa-session",
  "astra-lexa-progress",
];
let preparedOpenSequence = 0;
const deterministicQuery = new URLSearchParams({
  mode: "custom",
  seed: "e2e-baseline",
  topics: "myth,cosmos,greek",
  challenge: "quest",
  puzzleFamily: "classic",
  contentPackId: "auto",
  boardView: "crossword",
  style: "alpha",
  puzzleSize: "7",
  timerEnabled: "false",
  learningMode: "false",
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openPreparedPuzzle(page: Page, overrides: Record<string, string> = {}) {
  if (page.url().startsWith("http://127.0.0.1:3100")) {
    preparedOpenSequence += 1;
    await page.addInitScript(({ keys, flag, deferredPrefix }) => {
      if (!window.sessionStorage.getItem(flag)) {
        keys.forEach((key) => window.localStorage.removeItem(key));
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith(deferredPrefix)) window.localStorage.removeItem(key);
        }
        window.sessionStorage.setItem(flag, "true");
      }
    }, { keys: localStorageKeys, flag: `astra-e2e-reset-${preparedOpenSequence}`, deferredPrefix: pagehideStoragePrefix });
  }
  const query = new URLSearchParams(deterministicQuery);
  Object.entries(overrides).forEach(([key, value]) => query.set(key, value));

  await page.goto(`/?${query.toString()}`);
  await expect(page.locator('main#puzzle-studio[data-bootstrap-state="ready"]')).toBeVisible();
  await expect(page.locator("span").filter({ hasText: new RegExp(`^seed ${query.get("seed")}$`) }).first()).toBeVisible();
  await expect(page.getByTestId("progress-label")).toContainText("0/");
}

async function openPuzzle(page: Page, overrides: Record<string, string> = {}) {
  await openPreparedPuzzle(page, overrides);
  await page.getByTestId("start-puzzle").evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('main#puzzle-studio[data-run-state="attempt"]')).toBeVisible();
}

async function openSetup(page: Page) {
  const setupHeading = page.getByRole("heading", { name: "Build a new puzzle" });
  if (!(await setupHeading.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Open Setup", exact: true }).click();
  }
  await expect(setupHeading).toBeVisible();
}

async function openWordReview(page: Page) {
  await page.getByRole("button", { name: "Reveal active word" }).click();
  await page.getByRole("button", { name: "Reveal word" }).click();
  await expect(page.getByTestId("review-word-answer")).toBeVisible();
}

async function holdStorageCommitLock(page: Page) {
  await page.evaluate(() => {
    if (!navigator.locks) throw new Error("Storage retry timing test requires Web Locks.");
    const runtimeWindow = window as typeof window & {
      __astraStorageLockHeld?: boolean;
      __astraReleaseStorageLock?: () => void;
    };
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    runtimeWindow.__astraStorageLockHeld = false;
    runtimeWindow.__astraReleaseStorageLock = release;
    void navigator.locks.request("astra-lexa:v3:commit", { mode: "exclusive" }, async () => {
      runtimeWindow.__astraStorageLockHeld = true;
      await blocker;
      runtimeWindow.__astraStorageLockHeld = false;
    });
  });
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __astraStorageLockHeld?: boolean }).__astraStorageLockHeld))).toBe(true);
}

async function releaseStorageCommitLock(page: Page) {
  await page.evaluate(() => (window as typeof window & { __astraReleaseStorageLock?: () => void }).__astraReleaseStorageLock?.());
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __astraStorageLockHeld?: boolean }).__astraStorageLockHeld))).toBe(false);
}

async function solveRunFromPersistedFixture(page: Page) {
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, sessionStorageKey)).toBe(true);
  const answers = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      throw new Error("Expected the current run to be persisted before solving it");
    }

    const game = JSON.parse(raw) as { branches: { attempt: { value: { run: { words: Array<{ answer: string }> } } } } };
    return game.branches.attempt.value.run.words.map((word) => word.answer);
  }, sessionStorageKey);

  for (let index = 0; index < answers.length; index += 1) {
    await page.getByTestId("active-answer-input").fill(answers[index]);
    await expect(page.getByTestId("progress-label")).toContainText(`${index + 1}/${answers.length}`);
  }
}

async function readStoredAttempt(page: Page) {
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, sessionStorageKey)).toBe(true);
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      throw new Error("Expected a persisted v2 game");
    }
    return (JSON.parse(raw) as {
      branches: { attempt: { value: {
        attemptId: string;
        activeWordId: string | null;
        completedAt: string | null;
        elapsedMs: number;
        cellEntries: Record<string, string>;
        solvedIds: string[];
         run: {
           seed: string;
           puzzleId: string;
           generatorVersion: number;
           words: Array<{ id: string; answer: string; prompt: string; length: number }>;
           board: {
             kind?: "quest-v4";
             cells: Array<{ row: number; col: number; solution: string; wordIds: string[] }>;
             placements: Array<{ wordId: string; clueNumber: number; direction: "across" | "down"; row: number; col: number }>;
             paths?: Array<{ wordId: string; row: number; col: number; deltaRow: -1 | 0 | 1; deltaCol: -1 | 0 | 1 }>;
           };
        };
      } } };
    }).branches.attempt.value;
  }, sessionStorageKey);
}

function getQuestEndpoints(attempt: Awaited<ReturnType<typeof readStoredAttempt>>, wordId: string) {
  const word = attempt.run.words.find((entry) => entry.id === wordId);
  const placement = attempt.run.board.placements?.find((entry) => entry.wordId === wordId);
  const path = attempt.run.board.paths?.find((entry) => entry.wordId === wordId);
  if (!word || (!placement && !path)) {
    throw new Error(`Missing quest placement for ${wordId}`);
  }
  const start = path ?? placement!;
  const deltaRow = path?.deltaRow ?? (placement!.direction === "down" ? 1 : 0);
  const deltaCol = path?.deltaCol ?? (placement!.direction === "across" ? 1 : 0);

  return {
    start: { row: start.row, col: start.col },
    end: {
      row: start.row + deltaRow * (word.length - 1),
      col: start.col + deltaCol * (word.length - 1),
    },
    word,
    placement: placement ?? { ...path!, clueNumber: 0, direction: deltaRow === 0 ? "across" as const : "down" as const },
  };
}

async function solveQuestWordByEndpoints(page: Page, wordId: string, action: "click" | "tap" = "click") {
  const attempt = await readStoredAttempt(page);
  const { start, end } = getQuestEndpoints(attempt, wordId);
  const startCell = page.getByTestId(`board-cell-${start.row}-${start.col}`);
  const endCell = page.getByTestId(`board-cell-${end.row}-${end.col}`);
  await startCell[action]();
  await endCell[action]();
  await expect.poll(async () => (await readStoredAttempt(page)).solvedIds).toContain(wordId);
}

async function solveQuestRunFromPersistedFixture(page: Page) {
  const initial = await readStoredAttempt(page);
  for (const word of initial.run.words) {
    const current = await readStoredAttempt(page);
    if (!current.solvedIds.includes(word.id)) {
      await solveQuestWordByEndpoints(page, word.id);
    }
  }
}

async function readStoredAnswers(page: Page) {
  await readStoredAttempt(page);
  return page.evaluate((key) => {
    const game = JSON.parse(window.localStorage.getItem(key)!) as { branches: { attempt: { value: { run: { words: Array<{ answer: string }> } } } } };
    return game.branches.attempt.value.run.words.map((word) => word.answer.toUpperCase());
  }, sessionStorageKey);
}

test("loads a deterministic puzzle with the primary play controls", async ({ page }) => {
  await openPuzzle(page);

  await expect(page.getByRole("heading", { level: 1, name: "Astra Lexa daily crossword and word quest" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open the puzzle studio" })).toHaveAttribute("href", "#puzzle-studio");
  await expect(page.locator('main#puzzle-studio[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Fresh run", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("crossword answers stay out of the rendered page until deliberate review", async ({ page }) => {
  await openPuzzle(page, { learningMode: "true" });
  const answers = await readStoredAnswers(page);

  await expect(page.getByRole("heading", { name: "Clue progress" })).toBeVisible();
  await expect(page.getByText(/Factual word details unlock/i)).toBeVisible();
  const visibleText = (await page.locator("body").innerText()).toLowerCase();
  const ariaSnapshot = (await page.locator("body").ariaSnapshot()).toLowerCase();
  for (const answer of answers) {
    const token = new RegExp(`(^|[^a-z])${escapeRegExp(answer.toLowerCase())}([^a-z]|$)`);
    expect(visibleText).not.toMatch(token);
    expect(ariaSnapshot).not.toMatch(token);
  }

  await openWordReview(page);
  await expect(page.getByTestId("review-word-answer")).toHaveText(answers[0].toLowerCase());
});

test("player can deliberately review and solve the active clue", async ({ page }) => {
  await openPuzzle(page);
  await openWordReview(page);

  const answer = ((await page.getByTestId("review-word-answer").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByTestId("active-answer-input").fill(answer);

  await expect(page.getByTestId("progress-label")).toContainText("1/7");
});

test("player can use clue assistance and clue navigation", async ({ page }) => {
  await openPuzzle(page);

  const startingBadge = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Reveal letter" }).click();
  const input = page.getByTestId("active-answer-input");
  await expect(input).not.toHaveValue("");
  const revealedValue = await input.inputValue();
  await page.getByRole("button", { name: "Show scramble" }).click();
  await expect(page.getByText(/^Scramble:/)).toBeVisible();
  await page.getByRole("button", { name: "Clear word" }).click();
  await expect(input).toHaveValue(revealedValue);

  await page.getByRole("button", { name: "Next clue" }).click();
  await expect(page.getByTestId("active-clue-badge")).not.toHaveText(startingBadge);
});

test("player can type and navigate directly on the crossword grid", async ({ page }) => {
  await openPuzzle(page);

  const focusableCell = page.locator('[data-testid^="board-cell-"][tabindex="0"]');
  const startingCellId = await focusableCell.getAttribute("data-testid");
  expect(startingCellId).not.toBeNull();
  const firstPlayableCell = page.getByTestId(startingCellId!);
  await firstPlayableCell.click();
  await firstPlayableCell.press("A");
  await expect(firstPlayableCell).toContainText("A");

  const focusedCellId = await page.locator(":focus").getAttribute("data-testid");
  expect(focusedCellId).not.toBe(startingCellId);
  await page.locator(":focus").press("Backspace");
});

test("crossword grid exposes answer-safe names and preserves focus while switching direction", async ({ page }) => {
  await openPuzzle(page);
  const attempt = await readStoredAttempt(page);
  const intersection = attempt.run.board.cells.find((cell) => cell.wordIds.length > 1);
  expect(intersection).toBeTruthy();

  const playableCells = page.locator('button[role="gridcell"]');
  await expect(page.getByRole("grid", { name: "Crossword puzzle board" })).toBeVisible();
  expect(await playableCells.count()).toBeGreaterThan(0);
  await expect(page.locator('button[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  for (const label of await playableCells.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-label") ?? ""))) {
    expect(label).toMatch(/^Row \d+ column \d+,/);
    for (const word of attempt.run.words) {
      expect(label.toLowerCase()).not.toMatch(new RegExp(`(^|[^a-z])${escapeRegExp(word.answer.toLowerCase())}([^a-z]|$)`));
    }
  }

  const intersectionCell = page.getByTestId(`board-cell-${intersection!.row}-${intersection!.col}`);
  await intersectionCell.click();
  const startingDirection = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  await intersectionCell.press("Enter");
  await expect(page.getByTestId("active-clue-badge")).not.toHaveText(startingDirection);
  await expect(intersectionCell).toBeFocused();
  await expect(intersectionCell).toHaveAttribute("tabindex", "0");
  const outlineStyle = await intersectionCell.evaluate((cell) => getComputedStyle(cell).outlineStyle);
  expect(outlineStyle).not.toBe("none");
});

test("a solved crossing rejects a conflicting lane edit without partial changes", async ({ page }) => {
  await openPuzzle(page);
  const initial = await readStoredAttempt(page);
  const crossing = initial.run.board.cells.find((cell) => cell.wordIds.length === 2)!;
  const [solvedWordId, neighboringWordId] = crossing.wordIds;
  const solvedWord = initial.run.words.find((word) => word.id === solvedWordId)!;
  const neighboringWord = initial.run.words.find((word) => word.id === neighboringWordId)!;
  const neighboringPlacement = initial.run.board.placements.find((placement) => placement.wordId === neighboringWordId)!;
  const crossingIndex = neighboringPlacement.direction === "across"
    ? crossing.col - neighboringPlacement.col
    : crossing.row - neighboringPlacement.row;

  await page.getByRole("button").filter({ hasText: solvedWord.prompt }).first().click();
  await page.getByTestId("active-answer-input").fill(solvedWord.answer);
  await expect.poll(async () => (await readStoredAttempt(page)).solvedIds).toContain(solvedWordId);

  await page.getByRole("button").filter({ hasText: neighboringWord.prompt }).first().click();
  const input = page.getByTestId("active-answer-input");
  await expect(input).toBeFocused();
  await page.waitForTimeout(150);
  const beforeValue = await input.inputValue();
  const beforeEntries = (await readStoredAttempt(page)).cellEntries;
  const conflicting = Array.from({ length: neighboringWord.length }, (_, index) => (
    index === crossingIndex ? (crossing.solution === "z" ? "y" : "z") : "x"
  )).join("");

  await input.fill(conflicting);

  await expect(page.getByRole("status")).toContainText(/crossing is locked/i);
  await expect(input).toHaveValue(beforeValue);
  expect((await readStoredAttempt(page)).cellEntries).toEqual(beforeEntries);
});

test("clue selection retains partial input and Escape returns to the grid without clearing", async ({ page }) => {
  await openPuzzle(page);
  const attempt = await readStoredAttempt(page);
  const selectedWord = attempt.run.words.find((word) => word.id !== attempt.activeWordId && word.length >= 3)!;
  const placement = attempt.run.board.placements.find((entry) => entry.wordId === selectedWord.id)!;
  const clueButton = page.getByRole("button").filter({ hasText: selectedWord.prompt }).first();

  await clueButton.click();
  const input = page.getByTestId("active-answer-input");
  await expect(input).toBeFocused();
  await input.fill("ab");
  await expect(page.getByTestId("active-clue-badge")).toHaveText(new RegExp(`${placement.clueNumber}\\s+${placement.direction}`, "i"));
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const beforeEscape = await readStoredAttempt(page);

  await input.press("Escape");
  await expect(page.locator(':focus[role="gridcell"]')).toBeVisible();
  await expect(input).toHaveValue("ab");
  expect((await readStoredAttempt(page)).cellEntries).toEqual(beforeEscape.cellEntries);
});

test("full wrong and solved entries expose visible and spoken status", async ({ page }) => {
  await openPuzzle(page);
  const attempt = await readStoredAttempt(page);
  const activeWord = attempt.run.words.find((word) => word.id === attempt.activeWordId)!;
  const input = page.getByTestId("active-answer-input");
  const wrongAnswer = activeWord.answer.replace(/./g, activeWord.answer.toLowerCase() === "z".repeat(activeWord.length) ? "x" : "z");

  await input.fill(wrongAnswer);
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Not correct yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/not correct yet/i);

  await input.fill(activeWord.answer);
  await expect(page.getByTestId("progress-label")).toContainText("1/7");
  await expect(page.getByRole("status")).toContainText(/solved/i);
  await expect(page.getByRole("button").filter({ hasText: activeWord.prompt }).first()).toContainText(/solved/i);
});

test("review confirmation contains focus and restores or advances it safely", async ({ page }) => {
  await openPuzzle(page);
  const trigger = page.getByTestId("word-review-action");
  await expect(trigger).toHaveAccessibleName("Reveal active word");
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const reveal = dialog.getByRole("button", { name: "Reveal word" });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await cancel.press("Tab");
  await expect(reveal).toBeFocused();
  await reveal.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("button", { name: "Reveal word" }).click();
  await expect(page.getByRole("heading", { name: "Word Review" })).toBeFocused();
});

test("canceling review on a prepared puzzle does not start or save an attempt", async ({ page }) => {
  await openPreparedPuzzle(page);
  await page.getByRole("button", { name: "Reveal active word" }).click();
  await expect(page.getByRole("heading", { name: "Reveal this word?" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator('main#puzzle-studio[data-run-state="prepared"]')).toBeVisible();
  expect(await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), localStorageKeys)).toEqual(localStorageKeys.map(() => null));
  await expect(page.getByTestId("recent-run-card")).toHaveCount(0);
});

test("closing compact review restores its originating panel and control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page);
  const cluesTab = page.getByRole("tab", { name: "Clues", exact: true });
  const trigger = page.getByTestId("word-review-action");
  await expect(trigger).toHaveAccessibleName("Reveal active word");
  await expect(cluesTab).toHaveAttribute("aria-selected", "true");

  await trigger.click();
  await page.getByRole("dialog").getByRole("button", { name: "Reveal word" }).click();
  await expect(page.getByRole("tab", { name: "Word", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await expect(cluesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();
  await expect(trigger).toBeFocused();
});

test("word review remains bound to its authorized attempt and word", async ({ page }) => {
  await openPuzzle(page, { learningMode: "true" });
  const attempt = await readStoredAttempt(page);
  const firstWord = attempt.run.words.find((word) => word.id === attempt.activeWordId)!;
  const secondWord = attempt.run.words.find((word) => word.id !== firstWord.id)!;
  await openWordReview(page);
  await expect(page.getByTestId("review-word-answer")).toHaveText(firstWord.answer);

  await page.getByRole("button").filter({ hasText: secondWord.prompt }).first().click();
  await expect(page.getByTestId("review-word-answer")).toHaveText(firstWord.answer);
  await expect(page.getByText(secondWord.answer, { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Factual word details unlock/i)).toBeVisible();
});

test("short-word scramble never reveals the exact answer", async ({ page }) => {
  await openPuzzle(page, { seed: "greek-short", topics: "greek", puzzleSize: "4" });
  const attempt = await readStoredAttempt(page);
  const shortWord = attempt.run.words.find((word) => word.length === 3);
  expect(shortWord).toBeTruthy();
  await page.getByRole("button").filter({ hasText: shortWord!.prompt }).first().click();
  await page.getByRole("button", { name: "Show scramble" }).click();
  const scramble = ((await page.getByText(/^Scramble:/).textContent()) ?? "").replace(/^Scramble:\s*/i, "").trim();
  expect(scramble.toLowerCase()).not.toBe(shortWord!.answer.toLowerCase());
});

test("setup exposes advanced learning and board controls", async ({ page }) => {
  await openPuzzle(page);
  await openSetup(page);

  await page.getByRole("button", { name: "Show advanced" }).click();
  await page.getByLabel("Learning mode").check();
  await expect(page.getByLabel("Learning mode")).toBeChecked();
  await page.getByLabel("Board mode").selectOption("quest");
  await page.getByRole("button", { name: "Start Fresh Run" }).click();
  await page.getByTestId("run-replacement-dialog").getByRole("button", { name: "Save and replace" }).click();
  await expect(page.getByRole("heading", { name: "Quest board" })).toBeVisible();
});

test("setup advertises only certified crossword options and keeps trace topics broad", async ({ page }) => {
  await openPuzzle(page);
  await openSetup(page);

  await expect(page.getByRole("button", { name: "Ocean", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "City Light", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show advanced" }).click();
  await expect(page.getByLabel("Target count")).toHaveAttribute("max", "8");

  await page.getByLabel("Board mode").selectOption("quest");
  await expect(page.getByRole("button", { name: "City Light", exact: true })).toBeVisible();
  await expect(page.getByLabel("Target count")).toHaveAttribute("max", "12");
});

test("setup choice groups expose native state without starting or saving", async ({ page }) => {
  await openPreparedPuzzle(page);
  await openSetup(page);
  const modeGroup = page.getByRole("group", { name: "Mode" });
  const custom = modeGroup.getByRole("radio", { name: "custom" });
  const daily = modeGroup.getByRole("radio", { name: "daily" });
  await expect(custom).toBeChecked();
  await custom.press("ArrowRight");
  await expect(daily).toBeChecked();

  const advanced = page.locator('button[aria-controls="advanced-setup-options"]');
  await expect(advanced).toHaveAttribute("aria-expanded", "false");
  await expect(advanced).toHaveAttribute("aria-controls", "advanced-setup-options");
  await advanced.click();
  await expect(advanced).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("group", { name: "Difficulty" }).getByRole("radio", { checked: true })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Quest type" }).getByRole("radio", { checked: true })).toHaveCount(1);

  const ocean = page.getByRole("button", { name: "Ocean", exact: true });
  await expect(ocean).toHaveAttribute("aria-pressed", "false");
  await ocean.click();
  await expect(ocean).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), localStorageKeys)).toEqual(localStorageKeys.map(() => null));
});

test("mobile crossword starts clue-first and switches accessible workspace tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page);

  const cluesTab = page.getByRole("tab", { name: "Clues", exact: true });
  await expect(cluesTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));

  await page.getByRole("tab", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quest progress" })).toBeVisible();

  await page.getByRole("tab", { name: "Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
});

test("compact crossword and quest modes preserve their intended first panel", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openPuzzle(page);
  await expect(page.getByRole("tab", { name: "Clues", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));

  await openPuzzle(page, { boardView: "quest", seed: "mobile-quest" });
  await expect(page.getByRole("tab", { name: "Board", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Quest board" })).toBeVisible();
});

test("portrait Quest offers optional orientation guidance that clears in landscape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page, { boardView: "quest", seed: "quest-orientation" });
  await expect(page.getByRole("tab", { name: "Board", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("quest-orientation-note")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByTestId("quest-orientation-note")).toBeHidden();
  await expect(page.getByRole("tab", { name: "Board", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
});

test("forced colors retain focus, selection, and solved Quest boundaries", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openPuzzle(page, { generatorVersion: "4", boardView: "quest", seed: "trace-myth", topics: "myth", puzzleSize: "6" });
  const initial = await readStoredAttempt(page);
  const word = initial.run.words[0];
  const { start, end } = getQuestEndpoints(initial, word.id);
  const startCell = page.getByTestId(`board-cell-${start.row}-${start.col}`);
  await startCell.focus();
  expect(await startCell.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await startCell.click();
  await expect(startCell).toHaveAttribute("aria-selected", "true");
  await page.getByTestId(`board-cell-${end.row}-${end.col}`).click();
  await expect(startCell).toHaveAttribute("data-solved-cell", "true");
  expect(await startCell.evaluate((element) => getComputedStyle(element).borderStyle)).toBe("double");
});

test("compact header navigation activates hidden panels without starting play", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPreparedPuzzle(page);
  await expect(page.getByRole("tab", { name: "Clues", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Board", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();

  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Archive", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Quest progress" })).toBeVisible();
  expect(await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), localStorageKeys)).toEqual(localStorageKeys.map(() => null));
  await expect(page.getByTestId("elapsed-time")).toHaveText("00:00");
});

test("an untouched prepared puzzle creates no attempt, timer, storage, or history", async ({ page }) => {
  await openPreparedPuzzle(page);
  await page.waitForTimeout(250);

  await expect(page.locator('main#puzzle-studio[data-run-state="prepared"]')).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("Ready");
  await expect(page.getByTestId("elapsed-time")).toHaveText("00:00");
  await expect(page.getByTestId("recent-run-card")).toHaveCount(0);
  expect(await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), localStorageKeys)).toEqual(localStorageKeys.map(() => null));

  await page.getByRole("button", { name: "Open Setup", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(150);
  expect(await page.evaluate((keys) => keys.map((key) => window.localStorage.getItem(key)), localStorageKeys)).toEqual(localStorageKeys.map(() => null));

  await page.getByTestId("start-puzzle").click();
  await expect(page.locator('main#puzzle-studio[data-run-state="attempt"]')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, sessionStorageKey)).toBe(true);
});

test("pause and resume controls expose the current run state", async ({ page }) => {
  await openPuzzle(page);

  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("unfinished progress survives a reload without a placeholder overwrite", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("active-answer-input").fill("ab");
  await expect(page.getByTestId("active-answer-input")).toHaveValue("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const beforeReload = await readStoredAttempt(page);

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByTestId("active-answer-input")).toHaveValue("ab");
  const afterReload = await readStoredAttempt(page);

  expect(afterReload.attemptId).toBe(beforeReload.attemptId);
  expect(afterReload.cellEntries).toEqual(beforeReload.cellEntries);
});

test("an unfinished saved attempt takes precedence over a shared link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("active-answer-input").fill("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const saved = await readStoredAttempt(page);

  const query = new URLSearchParams(deterministicQuery);
  query.set("seed", "shared-does-not-replace");
  await page.goto(`/?${query}`);
  await expect(page.locator('main#puzzle-studio[data-bootstrap-state="ready"][data-run-state="attempt"]')).toBeVisible();
  const restored = await readStoredAttempt(page);

  expect(restored.attemptId).toBe(saved.attemptId);
  expect(restored.run.seed).toBe(saved.run.seed);
  expect(restored.cellEntries).toEqual(saved.cellEntries);
  await openSetup(page);
  await expect(page.getByText(/shared puzzle link was not opened/i)).toBeVisible();
});

test("paused gameplay actions cannot mutate persisted entries", async ({ page }) => {
  await openPuzzle(page);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  const before = await readStoredAttempt(page);

  await expect(page.getByRole("button", { name: "Reveal active word", exact: true })).toBeDisabled();
  const attempt = await readStoredAttempt(page);
  const startCell = attempt.run.board.cells.find((cell) => attempt.run.board.cells.some((candidate) => candidate.row === cell.row && candidate.col > cell.col))!;
  const boardCell = page.getByTestId(`board-cell-${startCell.row}-${startCell.col}`);
  await boardCell.focus();
  await boardCell.press("ArrowRight");
  await expect(page.locator(':focus[role="gridcell"]')).not.toHaveAttribute("data-testid", `board-cell-${startCell.row}-${startCell.col}`);
  await page.locator(':focus[role="gridcell"]').press("Z");
  await page.waitForTimeout(200);
  const after = await readStoredAttempt(page);

  expect(after.cellEntries).toEqual(before.cellEntries);
  await expect(page.getByTestId("progress-label")).toContainText("0/");
});

test("completion freezes its timestamp and elapsed time", async ({ page }) => {
  await openPuzzle(page, { timerEnabled: "true" });
  await solveRunFromPersistedFixture(page);
  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle complete" })).toBeFocused();
  await expect.poll(async () => (await readStoredAttempt(page)).completedAt).not.toBeNull();
  const completed = await readStoredAttempt(page);
  expect(completed.completedAt).not.toBeNull();

  await page.waitForTimeout(1_100);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  const attempt = await readStoredAttempt(page);
  const startCell = attempt.run.board.cells.find((cell) => attempt.run.board.cells.some((candidate) => candidate.row === cell.row && candidate.col > cell.col))!;
  const boardCell = page.getByTestId(`board-cell-${startCell.row}-${startCell.col}`);
  await boardCell.focus();
  await boardCell.press("ArrowRight");
  await expect(page.locator(':focus[role="gridcell"]')).not.toHaveAttribute("data-testid", `board-cell-${startCell.row}-${startCell.col}`);
  await boardCell.press("Z");
  await page.waitForTimeout(200);
  const after = await readStoredAttempt(page);

  expect(after.completedAt).toBe(completed.completedAt);
  expect(after.elapsedMs).toBe(completed.elapsedMs);
});

test("a completed canonical daily remains available after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("start-puzzle").click();
  await solveRunFromPersistedFixture(page);
  await expect.poll(async () => (await readStoredAttempt(page)).completedAt).not.toBeNull();
  const completed = await readStoredAttempt(page);

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByTestId("completion-card")).toBeVisible();
  const restored = await readStoredAttempt(page);

  expect(restored.attemptId).toBe(completed.attemptId);
  expect(restored.completedAt).toBe(completed.completedAt);
});

test("a completed custom run yields to a fresh canonical daily", async ({ page }) => {
  await openPuzzle(page);
  await solveRunFromPersistedFixture(page);
  await expect.poll(async () => (await readStoredAttempt(page)).completedAt).not.toBeNull();
  const completedCustom = await readStoredAttempt(page);
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));

  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.locator("span").filter({ hasText: new RegExp(`^seed ${today}$`) }).first()).toBeVisible();
  await expect(page.locator('main#puzzle-studio[data-run-state="prepared"]')).toBeVisible();
  const preserved = await readStoredAttempt(page);

  expect(preserved.attemptId).toBe(completedCustom.attemptId);
  expect(preserved.run.seed).toBe(completedCustom.run.seed);
});

test("an invalid shared link falls back safely without crashing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("active-answer-input").fill("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const saved = await readStoredAttempt(page);

  await page.goto("/?mode=daily&seed=not-a-date&timerEnabled=maybe");

  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByTestId("run-seed")).toContainText(saved.run.seed.replace(/^daily:/, ""));
  const restored = await readStoredAttempt(page);
  expect(restored.attemptId).toBe(saved.attemptId);
  expect(restored.cellEntries).toEqual(saved.cellEntries);
  await openSetup(page);
  await expect(page.getByText(/shared puzzle link was invalid.*saved attempt was resumed/i)).toBeVisible();
});

test("the visible timer does not persist once per second", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, "__storageWriteCount", { value: 0, writable: true });
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      (window as typeof window & { __storageWriteCount: number }).__storageWriteCount += 1;
      return original.call(this, key, value);
    };
  });
  await openPuzzle(page, { timerEnabled: "true" });
  await readStoredAttempt(page);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    (window as typeof window & { __storageWriteCount: number }).__storageWriteCount = 0;
  });

  await page.waitForTimeout(2_200);
  expect(await page.evaluate(() => (window as typeof window & { __storageWriteCount: number }).__storageWriteCount)).toBe(0);

  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __storageWriteCount: number }).__storageWriteCount)).toBeGreaterThan(0);
});

test("pagehide flushes one settled snapshot and bfcache restore excludes hidden time", async ({ page }) => {
  await openPuzzle(page, { timerEnabled: "true" });
  await readStoredAttempt(page);
  await page.waitForTimeout(200);
  const canonicalBeforeHide = await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey);

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  const stagedState = await page.evaluate(({ key, prefix }) => ({
    canonical: window.localStorage.getItem(key),
    deferred: Object.keys(window.localStorage).filter((storageKey) => storageKey.startsWith(prefix)),
  }), { key: sessionStorageKey, prefix: pagehideStoragePrefix });
  expect(stagedState.canonical).toBe(canonicalBeforeHide);
  expect(stagedState.deferred).toHaveLength(1);
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => page.evaluate((prefix) => Object.keys(window.localStorage).filter((key) => key.startsWith(prefix)).length, pagehideStoragePrefix)).toBe(0);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  const restored = await readStoredAttempt(page);

  expect(restored.elapsedMs).toBeLessThan(1_000);
  await expect(page.getByTestId("run-status")).toHaveText("Paused");
});

test("two tabs serialize the same base revision and reject one stale writer", async ({ page, context }) => {
  const secondPage = await context.newPage();
  await openPreparedPuzzle(page, { seed: "race-first" });
  await openPreparedPuzzle(secondPage, { seed: "race-second" });
  expect(await page.evaluate(() => Boolean(navigator.locks))).toBe(true);

  await Promise.all([
    page.getByTestId("start-puzzle").evaluate((button: HTMLButtonElement) => button.click()),
    secondPage.getByTestId("start-puzzle").evaluate((button: HTMLButtonElement) => button.click()),
  ]);

  const pages = [page, secondPage];
  await expect.poll(async () => {
    const statuses = (await Promise.all(pages.map((candidate) => candidate.getByTestId("storage-status").allTextContents()))).flat();
    return statuses.filter((status) => /another tab changed this local save/i.test(status)).length;
  }).toBe(1);
  const runStates = await Promise.all(pages.map((candidate) => candidate.locator("main#puzzle-studio").getAttribute("data-run-state")));
  expect(runStates.filter((state) => state === "attempt")).toHaveLength(2);
  const pageStatuses = await Promise.all(pages.map((candidate) => candidate.getByTestId("storage-status").allTextContents()));
  const rejectedIndex = pageStatuses.findIndex((statuses) => statuses.some((status) => /another tab changed this local save/i.test(status)));
  expect(rejectedIndex).toBeGreaterThanOrEqual(0);
  await expect(pages[rejectedIndex].getByRole("button", { name: "Retry saving" })).toHaveCount(0);
  const canonicalSeed = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { branches: { attempt: { value: { run: { seed: string } } } } }).branches.attempt.value.run.seed : null;
  }, sessionStorageKey);
  expect(["race-first", "race-second"]).toContain(canonicalSeed);
  expect(canonicalSeed).not.toBe(["race-first", "race-second"][rejectedIndex]);

  await secondPage.close();
});

test("shared daily options reopen the requested seeded run", async ({ page }) => {
  await openPuzzle(page, { mode: "daily", seed: "2026-04-24" });

  await expect(page.getByText("daily", { exact: true }).first()).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^seed 2026-04-24$/ }).first()).toBeVisible();
});

test("shared links declare exact provenance and omit retired options", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPuzzle(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Share link", exact: true }).click();
  await expect(page.getByText("Run link copied.")).toBeVisible();

  const sharedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(sharedUrl.searchParams.get("generatorVersion")).toBe("3");
  expect(sharedUrl.searchParams.get("corpusRevision")).toBe("word-bank-r1");
  expect(sharedUrl.searchParams.get("fingerprintVersion")).toBe("1");
  expect(sharedUrl.searchParams.get("puzzleFingerprint")).toMatch(/^p1-[a-f0-9]{64}$/);
  expect(sharedUrl.searchParams.has("clueDensity")).toBe(false);
});

test("clipboard rejection reports that the run link was not copied", async ({ page }) => {
  await openPuzzle(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator.clipboard, "writeText", {
      value: async () => { throw new DOMException("denied", "NotAllowedError"); },
      configurable: true,
    });
  });

  await page.getByRole("button", { name: "Share link", exact: true }).click();

  await expect(page.getByText(/clipboard unavailable.*run link was not copied/i)).toBeVisible();
});

test("a shared fingerprint mismatch fails visibly without opening a replacement", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPuzzle(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Share link", exact: true }).click();
  const sharedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  sharedUrl.searchParams.set("puzzleFingerprint", `p1-${"0".repeat(64)}`);

  const isolatedContext = await browser.newContext();
  const sharedPage = await isolatedContext.newPage();
  await sharedPage.goto(sharedUrl.toString());

  await expect(sharedPage.locator('main[data-hydrated="true"][data-run-state="prepared"]')).toBeVisible();
  await openSetup(sharedPage);
  await expect(sharedPage.locator("p:visible").filter({ hasText: /did not match its expected fingerprint.*nothing was replaced/i })).toBeVisible();
  expect(await sharedPage.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBeNull();
  await isolatedContext.close();
});

test("an untouched prepared daily rolls at the exact UTC boundary without persisting", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-07-29T23:59:30.000Z") });
  await page.goto("/");
  await page.clock.runFor(1);
  await expect(page.locator('main[data-hydrated="true"][data-run-state="prepared"]')).toBeVisible();
  await expect(page.getByTestId("run-seed")).toContainText("2026-07-29");

  await page.clock.runFor(30_000);

  await expect(page.getByTestId("run-seed")).toContainText("2026-07-30");
  await expect(page.locator('main[data-run-state="prepared"]')).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBeNull();
});

test("player sees completion and share actions after solving every word", async ({ page }) => {
  await openPuzzle(page);
  const completedAttemptId = (await readStoredAttempt(page)).attemptId;
  await solveRunFromPersistedFixture(page);

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle complete" })).toBeVisible();
  await expect(page.getByTestId("assist-recap-empty")).toHaveText("No assists used.");
  await expect(page.getByTestId("assist-recap")).toHaveCount(0);
  await expect(page.getByTestId("completion-card")).not.toContainText(/Word mix|common|uncommon|rare/i);
  await expect(page.getByRole("button", { name: "Share run link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy result text" })).toBeVisible();
  await page.getByRole("button", { name: "Restart", exact: true }).first().click();
  await expect(page.getByTestId("run-replacement-dialog")).toBeHidden();
  await expect.poll(async () => (await readStoredAttempt(page)).attemptId).not.toBe(completedAttemptId);
  expect((await readStoredAttempt(page)).cellEntries).toEqual({});
});

test("completion recap attributes persisted assists once and survives daily reload", async ({ page }) => {
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  await openPuzzle(page, { mode: "daily", seed: today });
  const initial = await readStoredAttempt(page);
  const assistedWord = initial.run.words.find((word) => word.id === initial.activeWordId)!;
  await page.getByRole("button", { name: "Get tip" }).click();
  await solveRunFromPersistedFixture(page);

  await expect(page.getByRole("heading", { name: "Puzzle complete with recorded assists" })).toBeVisible();
  await expect(page.getByTestId("assist-recap-word")).toHaveCount(1);
  const reviewAssist = page.getByRole("button", { name: new RegExp(`Review ${assistedWord.answer}.*1 hint step`, "i") });
  await expect(reviewAssist).toBeVisible();
  await reviewAssist.click();
  await expect(page.getByText(/1 of 3 hint steps were recorded for this word/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.locator('main#puzzle-studio[data-bootstrap-state="ready"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle complete with recorded assists" })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(`Review ${assistedWord.answer}.*1 hint step`, "i") })).toBeVisible();
});

test("completion after a full reveal uses the persisted factual outcome", async ({ page }) => {
  await openPuzzle(page);
  await page.getByRole("button", { name: "Reveal full puzzle" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reveal puzzle" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await solveRunFromPersistedFixture(page);
  await expect(page.getByRole("heading", { name: "Puzzle complete after full-puzzle reveal" })).toBeVisible();
  await expect(page.getByTestId("assist-recap-word")).toHaveCount(7);
  await expect(page.getByTestId("completion-assists")).toContainText("1");
  await expect(page.getByTestId("completion-assists")).toContainText(/full puzzle revealed/i);
});

test("daily completion exposes the daily share action", async ({ page }) => {
  await openPuzzle(page, { mode: "daily", seed: "2026-04-24" });
  await solveRunFromPersistedFixture(page);

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share daily result" })).toBeVisible();
});

test("unfinished replacement is cancel-first, focus-safe, and idempotent", async ({ page }) => {
  await openPuzzle(page);
  const initial = await readStoredAttempt(page);
  const activeWord = initial.run.words.find((word) => word.id === initial.activeWordId)!;
  await page.getByTestId("active-answer-input").fill(activeWord.answer);
  await expect.poll(async () => (await readStoredAttempt(page)).solvedIds).toContain(activeWord.id);
  const source = await readStoredAttempt(page);
  const trigger = page.getByRole("button", { name: "Fresh run", exact: true });

  await trigger.click();
  const dialog = page.getByTestId("run-replacement-dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Save and replace" });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  await cancel.press("Tab");
  await expect(confirm).toBeFocused();
  await confirm.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await readStoredAttempt(page)).attemptId).toBe(source.attemptId);
  expect((await readStoredAttempt(page)).cellEntries).toEqual(source.cellEntries);

  await trigger.click();
  await expect(cancel).toBeFocused();
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });

  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("run-title")).toBeFocused();
  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!) as {
    branches: {
      attempt: { value: { attemptId: string } };
      progress: { value: { history: Array<{ attemptId: string; solvedCount: number }> } };
    };
  }, sessionStorageKey);
  const storedAttempt = stored.branches.attempt.value;
  const storedProgress = stored.branches.progress.value;
  expect(storedAttempt.attemptId).not.toBe(source.attemptId);
  expect(storedProgress.history.filter((entry) => entry.attemptId === storedAttempt.attemptId)).toHaveLength(1);
  expect(storedProgress.history.find((entry) => entry.attemptId === source.attemptId)?.solvedCount).toBe(1);
  await page.waitForTimeout(250);
  const previousAttemptId = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { branches: { attempt: { value: { attemptId: string } } } }).branches.attempt.value.attemptId : null;
  }, "astra-lexa:v3:previous");
  expect(previousAttemptId).toBe(source.attemptId);

  const historyCard = page.getByTestId("recent-run-card").first();
  await expect(historyCard).toBeVisible();
  await expect(historyCard).toContainText(/replay/i);
});

test("Restart preserves the recorded generator and resets a distinct attempt", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "restart-v3" });
  const initial = await readStoredAttempt(page);
  expect(initial.run.generatorVersion).toBe(3);
  await solveQuestWordByEndpoints(page, initial.activeWordId!);
  const source = await readStoredAttempt(page);

  await page.getByRole("button", { name: "Restart", exact: true }).first().click();
  const dialog = page.getByTestId("run-replacement-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save and replace" }).click();
  const restarted = await readStoredAttempt(page);
  expect(restarted.attemptId).not.toBe(source.attemptId);
  expect(restarted.run.generatorVersion).toBe(3);
  expect(restarted.run.puzzleId).toBe(source.run.puzzleId);
  expect(restarted.cellEntries).toEqual({});
  expect(restarted.solvedIds).toEqual([]);
  expect(restarted.elapsedMs).toBe(0);
  await expect(page.getByTestId("recent-run-card").filter({ hasText: "1/7 solved" })).toHaveCount(1);
});

test("Restarting an untouched prepared run starts directly without outgoing history", async ({ page }) => {
  await openPreparedPuzzle(page);
  await page.getByRole("button", { name: "Restart", exact: true }).first().click();
  await expect(page.getByTestId("run-replacement-dialog")).toBeHidden();
  await expect(page.locator('main#puzzle-studio[data-run-state="attempt"]')).toBeVisible();
  await expect(page.getByTestId("recent-run-card")).toHaveCount(1);
  await expect(page.getByTestId("recent-run-card").first()).toContainText("0/7 solved");
});

test("replacement write failure leaves the source run and storage unchanged", async ({ page }) => {
  await openPuzzle(page);
  await page.getByTestId("active-answer-input").fill("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  const source = await readStoredAttempt(page);
  const rawSource = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])), localStorageKeys);
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    runtimeWindow.__astraOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage denied", "QuotaExceededError");
    };
  });

  const trigger = page.getByRole("button", { name: "Fresh run", exact: true });
  await trigger.click();
  await page.getByTestId("run-replacement-dialog").getByRole("button", { name: "Save and replace" }).click();

  await expect(page.getByTestId("run-replacement-dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId("storage-status")).toContainText(/local storage is full/i);
  expect((await readStoredAttempt(page)).attemptId).toBe(source.attemptId);
  expect((await readStoredAttempt(page)).cellEntries).toEqual(source.cellEntries);
  expect(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])), localStorageKeys)).toEqual(rawSource);

  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    if (runtimeWindow.__astraOriginalSetItem) {
      Storage.prototype.setItem = runtimeWindow.__astraOriginalSetItem;
      delete runtimeWindow.__astraOriginalSetItem;
    }
  });
});

test("explicit save retry persists the latest attempt and preserves deliberate focus", async ({ page }) => {
  await openPuzzle(page);
  await expect(page.getByRole("status")).toHaveCount(1);
  await readStoredAttempt(page);
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    runtimeWindow.__astraOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });

  const input = page.getByTestId("active-answer-input");
  await input.fill("ab");
  await expect(input).toBeFocused();
  await expect(page.getByTestId("storage-status")).toContainText(/not saved locally.*storage is full/i);
  const retry = page.getByRole("button", { name: "Retry saving" });
  await expect(retry).toBeVisible();
  expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(retry).toHaveAttribute("aria-describedby", "storage-status-message");
  const warningText = await page.getByTestId("storage-status").textContent();
  await page.getByRole("button", { name: "Next clue" }).click();
  await expect(page.getByTestId("storage-status")).toHaveText(warningText!);
  await expect(page.getByTestId("event-status")).toContainText(/local storage is full/i);
  const eventBeforeTick = await page.getByTestId("event-status").textContent();
  await page.waitForTimeout(1_100);
  await expect(page.getByTestId("event-status")).toHaveText(eventBeforeTick!);
  await expect(page.getByRole("heading", { name: "Facts currently in this tab" })).toBeVisible();

  await retry.click();
  await expect(page.getByTestId("storage-status")).toBeVisible();
  await expect(page.getByTestId("event-status")).toContainText(/still not saved locally.*storage is full/i);
  await expect(retry).toBeFocused();

  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & {
      __astraOriginalSetItem?: Storage["setItem"];
      __astraRetrySetItemCount?: number;
    };
    if (runtimeWindow.__astraOriginalSetItem) {
      Storage.prototype.setItem = runtimeWindow.__astraOriginalSetItem;
      delete runtimeWindow.__astraOriginalSetItem;
    }
    const restoredSetItem = Storage.prototype.setItem;
    runtimeWindow.__astraRetrySetItemCount = 0;
    Storage.prototype.setItem = function (...args) {
      runtimeWindow.__astraRetrySetItemCount = (runtimeWindow.__astraRetrySetItemCount ?? 0) + 1;
      return restoredSetItem.apply(this, args);
    };
  });
  await holdStorageCommitLock(page);
  await retry.click();
  const pendingRetry = page.getByTestId("retry-local-save");
  await expect(pendingRetry).toHaveText("Saving…");
  await expect(pendingRetry).toHaveAttribute("aria-busy", "true");
  await expect(pendingRetry).toHaveAttribute("aria-disabled", "true");
  await pendingRetry.evaluate((button: HTMLButtonElement) => button.click());
  await releaseStorageCommitLock(page);

  await expect(page.getByTestId("storage-status")).toBeHidden();
  await expect(page.getByTestId("event-status")).toHaveText("Progress saved locally.");
  await expect(page.getByTestId("event-status")).toBeFocused();
  await expect(page.getByRole("status")).toHaveCount(1);
  expect(await page.evaluate(() => (window as typeof window & { __astraRetrySetItemCount?: number }).__astraRetrySetItemCount)).toBe(4);
  const saved = await readStoredAttempt(page);
  expect(Object.keys(saved.cellEntries).length).toBeGreaterThan(0);

  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    runtimeWindow.__astraOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("Storage full", "QuotaExceededError"); };
  });
  await input.fill("cd");
  await expect(page.getByRole("button", { name: "Retry saving" })).toBeVisible();
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    if (runtimeWindow.__astraOriginalSetItem) {
      Storage.prototype.setItem = runtimeWindow.__astraOriginalSetItem;
      delete runtimeWindow.__astraOriginalSetItem;
    }
  });
  await holdStorageCommitLock(page);
  await page.getByRole("button", { name: "Retry saving" }).click();
  const nextClue = page.getByRole("button", { name: "Next clue" });
  await nextClue.focus();
  await releaseStorageCommitLock(page);
  await expect(page.getByTestId("storage-status")).toBeHidden();
  await expect(nextClue).toBeFocused();
  const savedWithMovedFocus = await readStoredAttempt(page);

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"][data-run-state="attempt"]')).toBeVisible();
  expect((await readStoredAttempt(page)).cellEntries).toEqual(savedWithMovedFocus.cellEntries);
});

test("corrupt newest v3 save restores the previous verified envelope visibly", async ({ page }) => {
  await openPuzzle(page);
  await readStoredAttempt(page);
  const input = page.getByTestId("active-answer-input");
  await input.fill("ab");
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, "astra-lexa:v3:previous")).toBe(true);
  await page.evaluate((key) => {
    window.localStorage.setItem(key, "corrupt-primary");
    Storage.prototype.setItem = () => {
      throw new DOMException("Simulated crash", "SecurityError");
    };
  }, sessionStorageKey);

  await page.reload();

  await expect(page.locator('main[data-hydrated="true"][data-run-state="attempt"]')).toBeVisible();
  await expect(page.getByTestId("storage-status")).toContainText(/previous verified save was restored/i);
  await expect(page.getByTestId("active-answer-input")).toHaveValue("");
});

test("a verified pending first adoption restores read-only instead of stale v2", async ({ page }) => {
  await openPuzzle(page);
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, sessionStorageKey)).toBe(true);
  const pendingAttemptId = await page.evaluate(({ primaryKey, markerKey, v2Key }) => {
    const raw = window.localStorage.getItem(primaryKey);
    if (!raw) throw new Error("Expected a v3 primary before simulating interrupted adoption.");
    const envelope = JSON.parse(raw) as {
      saveId: string;
      branches: { attempt: { value: { attemptId: string } }; progress: { value: unknown } };
    };
    window.localStorage.setItem(v2Key, JSON.stringify({
      schemaVersion: 2,
      currentAttempt: { ...envelope.branches.attempt.value, attemptId: "attempt-stale-v2" },
      progress: envelope.branches.progress.value,
    }));
    window.localStorage.setItem(markerKey, JSON.stringify({
      format: "astra-lexa/local-save-commit",
      markerVersion: 1,
      storageVersion: 3,
      committedSaveId: null,
      pendingSaveId: envelope.saveId,
    }));
    return envelope.branches.attempt.value.attemptId;
  }, { primaryKey: sessionStorageKey, markerKey: "astra-lexa:v3:commit", v2Key: "astra-lexa:v2" });

  await page.reload();

  await expect(page.locator('main[data-hydrated="true"][data-run-state="attempt"]')).toBeVisible();
  await expect(page.getByTestId("storage-status")).toContainText(/verified interrupted save was restored read-only/i);
  await expect(page.getByRole("button", { name: "Retry saving" })).toHaveCount(0);
  expect((await readStoredAttempt(page)).attemptId).toBe(pendingAttemptId);
  expect((await readStoredAttempt(page)).attemptId).not.toBe("attempt-stale-v2");
  const canonicalBeforeEdit = await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey);
  const input = page.getByTestId("active-answer-input");
  await input.fill("ab");
  await page.waitForTimeout(250);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBe(canonicalBeforeEdit);
  await page.getByRole("button", { name: "Fresh run", exact: true }).click();
  await expect(page.getByTestId("run-replacement-dialog")).toBeHidden();
  await expect(input).toHaveValue("ab");
  await expect(page.getByTestId("storage-status")).toContainText(/this tab will not overwrite local data/i);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBe(canonicalBeforeEdit);
});

test("legacy history uses settings under current rules instead of claiming exact replay", async ({ page }) => {
  await openPuzzle(page);
  await readStoredAttempt(page);
  await page.evaluate(({ primaryKey, deferredPrefix }) => {
    const raw = window.localStorage.getItem(primaryKey);
    if (!raw) throw new Error("Expected a stored run before downgrading progress provenance.");
    const envelope = JSON.parse(raw) as Record<string, any>;
    const progress = envelope.branches.progress;
    progress.stateSchemaVersion = 2;
    progress.value.schemaVersion = 2;
    delete progress.value.dailyLedger;
    for (const summary of progress.value.history) {
      delete summary.generatorVersion;
      delete summary.corpusRevision;
      delete summary.fingerprintVersion;
      delete summary.puzzleFingerprint;
      delete summary.exactReplay;
      delete summary.dailyOutcome;
    }
    window.localStorage.setItem(primaryKey, JSON.stringify(envelope));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function suppressDeferredWrite(key: string, value: string) {
      if (key.startsWith(deferredPrefix)) return;
      return original.call(this, key, value);
    };
  }, { primaryKey: sessionStorageKey, deferredPrefix: pagehideStoragePrefix });

  await page.reload();

  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByTestId("recent-run-card").first()).toContainText(/use settings\/current rules/i);
});

test("portable backup previews safely, replaces atomically, survives reload, and undoes", async ({ page }) => {
  await openPuzzle(page, { seed: "portable-source" });
  await page.getByTestId("active-answer-input").fill("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const source = await readStoredAttempt(page);
  const sourceAnswer = source.run.words[0].answer;
  const requests: string[] = [];
  const recordRequest = (request: { url(): string }) => requests.push(request.url());
  page.on("request", recordRequest);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-backup").click();
  const download = await downloadPromise;
  page.off("request", recordRequest);
  expect(requests).toEqual([]);
  expect(download.suggestedFilename()).toMatch(/^astra-lexa-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Expected a downloaded backup path.");
  const backupRaw = await readFile(downloadPath, "utf8");
  const wrapper = JSON.parse(backupRaw) as { format: string; backupVersion: number; containsAnswers: boolean };
  expect(wrapper).toMatchObject({ format: "astra-lexa/portable-backup", backupVersion: 1, containsAnswers: true });
  await expect(page.getByTestId("portable-backup-status")).toContainText(/contains puzzle answers.*keep it private/i);

  const freshTrigger = page.getByRole("button", { name: "Fresh run", exact: true });
  await freshTrigger.click();
  await page.getByTestId("run-replacement-dialog").getByRole("button", { name: "Save and replace" }).click();
  await expect(page.getByTestId("run-replacement-dialog")).toBeHidden();
  const beforeImport = await readStoredAttempt(page);
  expect(beforeImport.attemptId).not.toBe(source.attemptId);
  const beforePreviewStorage = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])), localStorageKeys);
  const file = { name: "astra-backup.json", mimeType: "application/json", buffer: Buffer.from(backupRaw) };

  const input = page.getByTestId("import-backup-input");
  await input.setInputFiles(file);
  const dialog = page.getByTestId("import-backup-dialog");
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(dialog).toBeVisible();
  await expect(cancel).toBeFocused();
  expect((await dialog.textContent())?.toLowerCase()).not.toContain(sourceAnswer.toLowerCase());
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(input).toBeFocused();
  expect(await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])), localStorageKeys)).toEqual(beforePreviewStorage);

  await page.getByTestId("active-answer-input").fill("xy");
  await input.setInputFiles(file);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Replace local data" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await readStoredAttempt(page)).attemptId).toBe(source.attemptId);
  await expect(page.getByTestId("portable-backup-status")).toContainText(/imported after verification.*undo is available/i);
  await expect(page.getByTestId("storage-status")).toContainText(/self-asserted.*not server verified/i);
  await expect(page.getByTestId("undo-import")).toBeVisible();

  await page.reload();
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.getByTestId("undo-import")).toBeVisible();
  await page.getByTestId("undo-import").click();
  await expect.poll(async () => (await readStoredAttempt(page)).attemptId).toBe(beforeImport.attemptId);
  await expect(page.getByTestId("active-answer-input")).toHaveValue("xy");
  await expect(page.getByTestId("portable-backup-status")).toContainText(/pre-import local save was restored/i);
  await expect(page.getByTestId("undo-import")).toBeHidden();
});

test("malformed or denied backup import stays visible and preserves the current run", async ({ page }) => {
  await openPuzzle(page, { seed: "portable-failure" });
  await readStoredAttempt(page);
  const original = await readStoredAttempt(page);
  const input = page.getByTestId("import-backup-input");
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("not-json") });
  await expect(page.getByTestId("import-backup-dialog")).toBeHidden();
  await expect(page.getByTestId("portable-backup-status")).toContainText(/malformed.*nothing was replaced/i);
  expect((await readStoredAttempt(page)).attemptId).toBe(original.attemptId);

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-backup").click();
  const downloadPath = await (await downloadPromise).path();
  if (!downloadPath) throw new Error("Expected a downloaded backup path.");
  const validRaw = await readFile(downloadPath, "utf8");
  await page.evaluate((undoKey) => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    runtimeWindow.__astraOriginalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function denyUndo(key: string, value: string) {
      if (key === undoKey) throw new DOMException("Storage full", "QuotaExceededError");
      return runtimeWindow.__astraOriginalSetItem!.call(this, key, value);
    };
  }, "astra-lexa:v3:import-undo");

  await input.setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(validRaw) });
  await page.getByTestId("import-backup-dialog").getByRole("button", { name: "Replace local data" }).click();

  await expect(page.getByTestId("import-backup-dialog")).toBeHidden();
  await expect(page.getByTestId("portable-backup-status")).toContainText(/local storage is full/i);
  expect((await readStoredAttempt(page)).attemptId).toBe(original.attemptId);
  await page.evaluate(() => {
    const runtimeWindow = window as typeof window & { __astraOriginalSetItem?: Storage["setItem"] };
    if (runtimeWindow.__astraOriginalSetItem) {
      Storage.prototype.setItem = runtimeWindow.__astraOriginalSetItem;
      delete runtimeWindow.__astraOriginalSetItem;
    }
  });
});

test("learning mode exposes vocabulary support after deliberate review", async ({ page }) => {
  await openPuzzle(page, { learningMode: "true" });
  await openWordReview(page);

  const support = page.getByTestId("review-vocabulary-support");
  await expect(support).toContainText(/Factual word details/i);
  await expect(support).toContainText(/Puzzle clue/i);
  await expect(support).not.toContainText(/Plain meaning|Example|Pronunciation/i);
  await expect(support.getByRole("button", { name: /^Hear .* pronounced$/i })).toBeVisible();
});

test("unreviewed Quest words never present generated learning fields as facts", async ({ page }) => {
  await openPuzzle(page, { generatorVersion: "4", boardView: "quest", seed: "trace-myth", topics: "myth", puzzleSize: "6", learningMode: "true" });
  await readStoredAttempt(page);
  const generatedFields = await page.evaluate((key) => {
    const envelope = JSON.parse(window.localStorage.getItem(key)!);
    const word = envelope.branches.attempt.value.run.words[0];
    return [word.learningNote, word.plainMeaning, word.pronunciationHint, word.usageExample, word.translationAid] as string[];
  }, sessionStorageKey);
  const beforeReview = await page.locator("body").innerText();
  for (const generated of generatedFields) expect(beforeReview).not.toContain(generated);

  await page.getByRole("button", { name: "Reveal active word" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reveal word" }).click();
  await expect(page.getByTestId("review-vocabulary-support")).toContainText(/No approved editorial puzzle clue/i);
  const afterReview = await page.locator("body").innerText();
  for (const generated of generatedFields) expect(afterReview).not.toContain(generated);
  await expect(page.locator("body")).not.toContainText(/Plain meaning|Meaning cue|Use it like this|Nearby words/i);
});

test("quest grid is semantic and solves a target with keyboard endpoints", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "quest-keyboard" });
  const attempt = await readStoredAttempt(page);
  expect(attempt.run.generatorVersion).toBe(3);
  expect(attempt.run.board.kind).toBeUndefined();
  const activeWord = attempt.run.words.find((word) => word.id === attempt.activeWordId)!;
  const { start, end, placement } = getQuestEndpoints(attempt, activeWord.id);
  const grid = page.getByRole("grid", { name: "Quest word search board" });

  await expect(grid.getByRole("row")).toHaveCount(14);
  await expect(grid.getByRole("gridcell")).toHaveCount(196);
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await expect(grid.getByRole("gridcell").first()).toHaveAccessibleName(/^Row 1 column 1, letter [A-Z]/);
  const startCell = page.getByTestId(`board-cell-${start.row}-${start.col}`);
  await startCell.focus();
  await startCell.press("Enter");
  await expect(page.getByTestId("quest-status")).toContainText(/start selected/i);
  await expect(startCell).toHaveAttribute("aria-selected", "true");

  const directionKey = placement.direction === "down" ? "ArrowDown" : "ArrowRight";
  for (let index = 1; index < activeWord.length; index += 1) {
    await page.locator(':focus[role="gridcell"]').press(directionKey);
  }
  const endCell = page.getByTestId(`board-cell-${end.row}-${end.col}`);
  await expect(endCell).toBeFocused();
  await endCell.press("Enter");

  await expect(page.getByTestId("progress-label")).toContainText("1/7");
  await expect(page.getByTestId("quest-status")).toContainText(/found/i);
  await expect(grid.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
});

test("Quest v4 survives solve, reload, and exact shared-link regeneration", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPuzzle(page, { generatorVersion: "4", boardView: "quest", seed: "trace-myth", topics: "myth", puzzleSize: "6" });
  const initial = await readStoredAttempt(page);
  expect(initial.run.generatorVersion).toBe(4);
  expect(initial.run.puzzleId).toMatch(/^q4-[a-f0-9]{64}$/);
  expect(initial.run.board.kind).toBe("quest-v4");
  expect(initial.run.board.paths).toHaveLength(6);
  const schema = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!).branches.attempt.stateSchemaVersion, sessionStorageKey);
  expect(schema).toBe(4);

  const word = initial.run.words[0];
  const { start, end } = getQuestEndpoints(initial, word.id);
  await page.getByTestId(`board-cell-${end.row}-${end.col}`).click();
  await page.getByTestId(`board-cell-${start.row}-${start.col}`).click();
  await expect.poll(async () => (await readStoredAttempt(page)).solvedIds).toContain(word.id);

  await page.reload();
  await expect(page.locator('main#puzzle-studio[data-bootstrap-state="ready"]')).toBeVisible();
  const restored = await readStoredAttempt(page);
  expect(restored.run.puzzleId).toBe(initial.run.puzzleId);
  expect(restored.solvedIds).toContain(word.id);

  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Share link", exact: true }).click();
  const sharedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(sharedUrl.searchParams.get("generatorVersion")).toBe("4");
  expect(sharedUrl.searchParams.get("puzzleFingerprint")).toMatch(/^p1-[a-f0-9]{64}$/);

  const sharedContext = await browser.newContext();
  const sharedPage = await sharedContext.newPage();
  try {
    await sharedPage.goto(sharedUrl.toString());
    await expect(sharedPage.locator('main#puzzle-studio[data-bootstrap-state="ready"]')).toBeVisible();
    await sharedPage.getByTestId("start-puzzle").evaluate((button: HTMLButtonElement) => button.click());
    const sharedAttempt = await readStoredAttempt(sharedPage);
    expect(sharedAttempt.run.generatorVersion).toBe(4);
    expect(sharedAttempt.run.puzzleId).toBe(initial.run.puzzleId);
  } finally {
    await sharedContext.close();
  }
});

test("quest selection reports invalid paths and Escape clearing", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "quest-status" });
  const first = page.getByTestId("board-cell-0-0");
  await first.focus();
  await first.press("Enter");
  await first.press("ArrowRight");
  await page.locator(':focus[role="gridcell"]').press("ArrowRight");
  await page.locator(':focus[role="gridcell"]').press("ArrowDown");
  await page.locator(':focus[role="gridcell"]').press("Enter");
  await expect(page.getByTestId("quest-status")).toContainText(/not aligned/i);
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);

  await first.focus();
  await first.press("Enter");
  await first.press("ArrowRight");
  await page.locator(':focus[role="gridcell"]').press("Enter");
  await expect(page.getByTestId("quest-status")).toContainText(/no unsolved target/i);
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);

  await first.focus();
  await first.press("Enter");
  await first.press("Escape");
  await expect(page.getByTestId("quest-status")).toContainText(/selection cleared/i);
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);
});

test("quest target and adjacent controls focus the selected word start", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "quest-focus" });
  const initial = await readStoredAttempt(page);
  const target = initial.run.words.find((word) => word.id !== initial.activeWordId)!;
  const targetStart = getQuestEndpoints(initial, target.id).start;
  await page.getByTestId(`target-word-${target.id}`).click();
  await expect(page.getByTestId(`board-cell-${targetStart.row}-${targetStart.col}`)).toBeFocused();
  await expect.poll(async () => (await readStoredAttempt(page)).activeWordId).toBe(target.id);

  await page.getByRole("button", { name: "Next clue" }).click();
  await expect.poll(async () => (await readStoredAttempt(page)).activeWordId).not.toBe(target.id);
  const afterNext = await readStoredAttempt(page);
  const nextStart = getQuestEndpoints(afterNext, afterNext.activeWordId!).start;
  await expect(page.getByTestId(`board-cell-${nextStart.row}-${nextStart.col}`)).toBeFocused();

  await page.getByRole("button", { name: "Previous clue" }).click();
  await expect.poll(async () => (await readStoredAttempt(page)).activeWordId).toBe(target.id);
  const afterPrevious = await readStoredAttempt(page);
  const previousStart = getQuestEndpoints(afterPrevious, afterPrevious.activeWordId!).start;
  await expect(page.getByTestId(`board-cell-${previousStart.row}-${previousStart.col}`)).toBeFocused();
});

test("real touch taps solve one quest target without residual selection", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  const touchPage = await context.newPage();
  try {
    await openPuzzle(touchPage, { boardView: "quest", seed: "quest-touch" });
    const attempt = await readStoredAttempt(touchPage);
    await solveQuestWordByEndpoints(touchPage, attempt.activeWordId!, "tap");
    await expect(touchPage.getByTestId("progress-label")).toContainText("1/7");
    await expect(touchPage.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("paused and completed quest grids navigate without mutating results", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "quest-lifecycle" });
  const anchor = page.getByTestId("board-cell-0-0");
  await anchor.focus();
  await anchor.press("Enter");
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByTestId("quest-status")).toContainText(/paused/i);
  await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);
  await expect(anchor).toHaveAttribute("aria-readonly", "true");
  await expect(anchor).not.toBeDisabled();
  const pausedBefore = await readStoredAttempt(page);
  await anchor.focus();
  await anchor.press("ArrowRight");
  await expect(page.getByTestId("board-cell-0-1")).toBeFocused();
  await page.getByTestId("board-cell-0-1").press("Enter");
  const pausedAfter = await readStoredAttempt(page);
  expect(pausedAfter.solvedIds).toEqual(pausedBefore.solvedIds);
  expect(pausedAfter.cellEntries).toEqual(pausedBefore.cellEntries);

  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await solveQuestRunFromPersistedFixture(page);
  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(anchor).toHaveAttribute("aria-readonly", "true");
  const completedBefore = await readStoredAttempt(page);
  await anchor.focus();
  await anchor.press("ArrowRight");
  await expect(page.getByTestId("board-cell-0-1")).toBeFocused();
  await page.getByTestId("board-cell-0-1").press("Enter");
  const completedAfter = await readStoredAttempt(page);
  expect(completedAfter.solvedIds).toEqual(completedBefore.solvedIds);
  expect(completedAfter.cellEntries).toEqual(completedBefore.cellEntries);
  expect(completedAfter.completedAt).toBe(completedBefore.completedAt);
  await expect(page.getByTestId("quest-status")).toContainText(/complete/i);
});

test("responsive workspace keeps panels and board overflow contained", async ({ page }) => {
  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await openPuzzle(page, { seed: `responsive-${width}` });
    await expect(page.getByRole("tab", { name: "Clues", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
    for (const tab of await page.getByRole("tab").all()) {
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      const controls = await tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      await expect(page.locator(`#${controls}`)).toHaveAttribute("role", "tabpanel");
    }
  }

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await openPuzzle(page, { boardView: "quest", seed: `responsive-quest-${width}` });
    const scroller = page.getByTestId("board-scroller");
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await scroller.evaluate((element) => { element.scrollLeft = 80; });
    expect(await scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(await page.evaluate(() => document.documentElement.clientWidth));
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await openPuzzle(page, { seed: "responsive-desktop" });
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Puzzle board workspace" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Puzzle clues" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Progress and history" })).toBeVisible();
});

test("quest mode renders and solves a full trace grid with a pointer", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest" });

  await expect(page.getByText(/Trace a straight path across the full grid/i)).toBeVisible();
  await expect(page.locator('[data-testid^="board-cell-"]')).toHaveCount(196);

  const activeCells = page.locator('[data-active-cell="true"]');
  const activeCellCount = await activeCells.count();
  expect(activeCellCount).toBeGreaterThan(1);
  await activeCells.first().hover();
  await page.mouse.down();
  await activeCells.last().hover();
  await page.mouse.up();

  await expect(page.getByTestId("progress-label")).toContainText("1/7");
});
