import { expect, test, type Page } from "@playwright/test";

const sessionStorageKey = "astra-lexa-session";
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
  clueDensity: "2",
  timerEnabled: "false",
  learningMode: "false",
});

async function openPuzzle(page: Page, overrides: Record<string, string> = {}) {
  const query = new URLSearchParams(deterministicQuery);
  Object.entries(overrides).forEach(([key, value]) => query.set(key, value));

  await page.goto(`/?${query.toString()}`);
  await expect(page.locator("span").filter({ hasText: new RegExp(`^seed ${query.get("seed")}$`) }).first()).toBeVisible();
  await expect(page.getByTestId("progress-label")).toContainText("0/");
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
  const answers = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      throw new Error("Expected the current run to be persisted before solving it");
    }

    const state = JSON.parse(raw) as { run: { words: Array<{ answer: string }> } };
    return state.run.words.map((word) => word.answer);
  }, sessionStorageKey);

  for (let index = 0; index < answers.length; index += 1) {
    await page.getByTestId("active-answer-input").fill(answers[index]);
    await expect(page.getByTestId("progress-label")).toContainText(`${index + 1}/${answers.length}`);
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("loads a deterministic puzzle with the primary play controls", async ({ page }) => {
  await openPuzzle(page);

  await expect(page.locator("h1")).toHaveText(/\S+/);
  await expect(page.getByRole("button", { name: "Fresh run", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
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

test("setup exposes advanced learning and board controls", async ({ page }) => {
  await openPuzzle(page);
  await openSetup(page);

  await page.getByRole("button", { name: "Show advanced" }).click();
  await page.getByLabel("Learning mode").check();
  await expect(page.getByLabel("Learning mode")).toBeChecked();
  await page.getByLabel("Board mode").selectOption("quest");
  await expect(page.getByRole("heading", { name: "Quest board" })).toBeVisible();
});

test("mobile player can switch between board, clues, and archive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzle(page);

  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
  await page.getByRole("button", { name: "Clues", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();

  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quest progress" })).toBeVisible();

  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
});

test("pause and resume controls expose the current run state", async ({ page }) => {
  await openPuzzle(page);

  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).first().click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});

test("shared daily options reopen the requested seeded run", async ({ page }) => {
  await openPuzzle(page, { mode: "daily", seed: "2026-04-24" });

  await expect(page.getByText("daily", { exact: true }).first()).toBeVisible();
  await expect(page.locator("span").filter({ hasText: /^seed 2026-04-24$/ }).first()).toBeVisible();
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

  await expect(page.getByTestId("recent-run-card").first()).toBeVisible();
  await expect(page.getByTestId("recent-run-card").first()).toContainText(/resume/i);
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
