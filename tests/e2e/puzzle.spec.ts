import { expect, test, type Page } from "@playwright/test";

const sessionStorageKey = "astra-lexa:v2";
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
    await page.addInitScript(({ key, flag }) => {
      if (!window.sessionStorage.getItem(flag)) {
        window.localStorage.removeItem(key);
        window.sessionStorage.setItem(flag, "true");
      }
    }, { key: sessionStorageKey, flag: `astra-e2e-reset-${preparedOpenSequence}` });
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
  await page.getByRole("button", { name: "Review Word" }).click();
  await page.getByRole("button", { name: "Reveal word" }).click();
  await expect(page.getByTestId("review-word-answer")).toBeVisible();
}

async function solveRunFromPersistedFixture(page: Page) {
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key) !== null, sessionStorageKey)).toBe(true);
  const answers = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      throw new Error("Expected the current run to be persisted before solving it");
    }

    const game = JSON.parse(raw) as { currentAttempt: { run: { words: Array<{ answer: string }> } } };
    return game.currentAttempt.run.words.map((word) => word.answer);
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
      currentAttempt: {
        attemptId: string;
        activeWordId: string | null;
        completedAt: string | null;
        elapsedMs: number;
        cellEntries: Record<string, string>;
        solvedIds: string[];
        run: {
          seed: string;
          puzzleId: string;
          words: Array<{ id: string; answer: string; prompt: string; length: number }>;
          board: {
            cells: Array<{ row: number; col: number; wordIds: string[] }>;
            placements: Array<{ wordId: string; clueNumber: number; direction: "across" | "down"; row: number; col: number }>;
          };
        };
      };
    }).currentAttempt;
  }, sessionStorageKey);
}

function getQuestEndpoints(attempt: Awaited<ReturnType<typeof readStoredAttempt>>, wordId: string) {
  const word = attempt.run.words.find((entry) => entry.id === wordId);
  const placement = attempt.run.board.placements.find((entry) => entry.wordId === wordId);
  if (!word || !placement) {
    throw new Error(`Missing quest placement for ${wordId}`);
  }

  return {
    start: { row: placement.row, col: placement.col },
    end: {
      row: placement.row + (placement.direction === "down" ? word.length - 1 : 0),
      col: placement.col + (placement.direction === "across" ? word.length - 1 : 0),
    },
    word,
    placement,
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
    const game = JSON.parse(window.localStorage.getItem(key)!) as { currentAttempt: { run: { words: Array<{ answer: string }> } } };
    return game.currentAttempt.run.words.map((word) => word.answer.toUpperCase());
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
  await expect(page.getByText(/Vocabulary examples, pronunciation, and translation notes unlock/i)).toBeVisible();
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
  await expect(page.getByTestId("active-answer-input")).not.toHaveValue("");
  await page.getByRole("button", { name: "Show scramble" }).click();
  await expect(page.getByText(/^Scramble:/)).toBeVisible();
  await page.getByRole("button", { name: "Clear word" }).click();
  await expect(page.getByTestId("active-answer-input")).toHaveValue("");

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
  const trigger = page.getByRole("button", { name: "Review Word", exact: true });
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

test("closing compact review restores its originating panel and control", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page);
  const cluesTab = page.getByRole("tab", { name: "Clues", exact: true });
  const trigger = page.getByRole("button", { name: "Review Word", exact: true });
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
  await expect(page.getByText(/Vocabulary examples, pronunciation, and translation notes unlock/i)).toBeVisible();
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

test("an untouched prepared puzzle creates no attempt, timer, storage, or history", async ({ page }) => {
  await openPreparedPuzzle(page);
  await page.waitForTimeout(250);

  await expect(page.locator('main#puzzle-studio[data-run-state="prepared"]')).toBeVisible();
  await expect(page.getByTestId("run-status")).toHaveText("Ready");
  await expect(page.getByTestId("elapsed-time")).toHaveText("00:00");
  await expect(page.getByTestId("recent-run-card")).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBeNull();

  await page.getByRole("button", { name: "Open Setup", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(150);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), sessionStorageKey)).toBeNull();

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

  await expect(page.getByRole("button", { name: "Review Word", exact: true })).toBeDisabled();
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
  await expect(page.getByRole("heading", { name: "Puzzle cleared." })).toBeFocused();
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

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await page.waitForTimeout(120);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  const restored = await readStoredAttempt(page);

  expect(restored.elapsedMs).toBeLessThan(1_000);
  await expect(page.getByTestId("run-status")).toHaveText("Paused");
});

test("shared daily options reopen the requested seeded run", async ({ page }) => {
  await openPuzzle(page, { mode: "daily", seed: "2026-04-24" });

  await expect(page.getByText("daily", { exact: true }).first()).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^seed 2026-04-24$/ }).first()).toBeVisible();
});

test("shared links declare generator v3 and omit retired options", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openPuzzle(page);
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.getByRole("button", { name: "Share link", exact: true }).click();
  await expect(page.getByText("Run link copied.")).toBeVisible();

  const sharedUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(sharedUrl.searchParams.get("generatorVersion")).toBe("3");
  expect(sharedUrl.searchParams.has("clueDensity")).toBe(false);
});

test("player sees completion and share actions after solving every word", async ({ page }) => {
  await openPuzzle(page);
  await solveRunFromPersistedFixture(page);

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share run link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy result text" })).toBeVisible();
});

test("daily completion exposes the daily share action", async ({ page }) => {
  await openPuzzle(page, { mode: "daily", seed: "2026-04-24" });
  await solveRunFromPersistedFixture(page);

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByRole("button", { name: "Share daily result" })).toBeVisible();
});

test("starting another run records local history", async ({ page }) => {
  await openPuzzle(page);
  await page.getByRole("button", { name: "Fresh run", exact: true }).click();

  const historyCard = page.getByTestId("recent-run-card").first();
  await expect(historyCard).toBeVisible();
  await expect(historyCard).toContainText(/replay/i);
  const beforeReplay = await readStoredAttempt(page);
  await historyCard.click();
  await expect.poll(async () => (await readStoredAttempt(page)).attemptId).not.toBe(beforeReplay.attemptId);
});

test("learning mode exposes vocabulary support after deliberate review", async ({ page }) => {
  await openPuzzle(page, { learningMode: "true" });
  await openWordReview(page);

  const support = page.getByTestId("review-vocabulary-support");
  await expect(support).toContainText(/Example:/);
  await expect(support).toContainText(/Plain meaning:/);
  await expect(support).toContainText(/Pronunciation:/);
  await expect(support.getByRole("button", { name: "Speak" })).toBeVisible();
});

test("quest grid is semantic and solves a target with keyboard endpoints", async ({ page }) => {
  await openPuzzle(page, { boardView: "quest", seed: "quest-keyboard" });
  const attempt = await readStoredAttempt(page);
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
  await expect(page.getByTestId("quest-status")).toContainText(/cleared/i);
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
