import { expect, test, type Page } from "@playwright/test";

const sessionStorageKey = "astra-lexa:v2";
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
        completedAt: string | null;
        elapsedMs: number;
        cellEntries: Record<string, string>;
        run: { seed: string; puzzleId: string };
      };
    }).currentAttempt;
  }, sessionStorageKey);
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

  await expect(page.locator("h1")).toHaveText(/\S+/);
  await expect(page.getByRole("button", { name: "Fresh run", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Puzzle board" })).toBeVisible();
});

test("crossword answers stay out of the rendered page until deliberate review", async ({ page }) => {
  await openPuzzle(page, { learningMode: "true" });
  const answers = await readStoredAnswers(page);

  await expect(page.getByRole("heading", { name: "Clue progress" })).toBeVisible();
  await expect(page.getByText(/Vocabulary examples, pronunciation, and translation notes unlock/i)).toBeVisible();
  for (const answer of answers) {
    await expect(page.getByText(answer, { exact: true })).toHaveCount(0);
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

test("a valid shared link overrides an unfinished saved attempt", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("active-answer-input").fill("ab");
  const saved = await readStoredAttempt(page);

  await openPuzzle(page, { seed: "shared-wins" });
  await expect.poll(async () => (await readStoredAttempt(page)).run.seed).toBe("shared-wins");
  const shared = await readStoredAttempt(page);

  expect(shared.attemptId).not.toBe(saved.attemptId);
  expect(shared.run.seed).toBe("shared-wins");
});

test("paused gameplay actions cannot mutate persisted entries", async ({ page }) => {
  await openPuzzle(page);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  const before = await readStoredAttempt(page);

  const boardCell = page.locator('[data-testid^="board-cell-"]').first();
  await boardCell.click();
  await boardCell.press("Z");
  await page.waitForTimeout(200);
  const after = await readStoredAttempt(page);

  expect(after.cellEntries).toEqual(before.cellEntries);
  await expect(page.getByTestId("progress-label")).toContainText("0/");
});

test("completion freezes its timestamp and elapsed time", async ({ page }) => {
  await openPuzzle(page, { timerEnabled: "true" });
  await solveRunFromPersistedFixture(page);
  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect.poll(async () => (await readStoredAttempt(page)).completedAt).not.toBeNull();
  const completed = await readStoredAttempt(page);
  expect(completed.completedAt).not.toBeNull();

  await page.waitForTimeout(1_100);
  await page.getByRole("button", { name: "Pause", exact: true }).first().click();
  const boardCell = page.locator('[data-testid^="board-cell-"]').first();
  await boardCell.press("Z");
  await page.waitForTimeout(200);
  const after = await readStoredAttempt(page);

  expect(after.completedAt).toBe(completed.completedAt);
  expect(after.elapsedMs).toBe(completed.elapsedMs);
});

test("a completed canonical daily remains available after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
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
  await expect.poll(async () => (await readStoredAttempt(page)).run.seed).toBe(`daily:${today}`);
  const daily = await readStoredAttempt(page);

  expect(daily.attemptId).not.toBe(completedCustom.attemptId);
});

test("an invalid shared link falls back safely without crashing", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await page.getByTestId("active-answer-input").fill("ab");
  await expect.poll(async () => Object.keys((await readStoredAttempt(page)).cellEntries).length).toBeGreaterThan(0);
  const saved = await readStoredAttempt(page);
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));

  await page.goto("/?mode=daily&seed=not-a-date&timerEnabled=maybe");

  await expect(page.locator('main[data-hydrated="true"]')).toBeVisible();
  await expect(page.locator("span").filter({ hasText: new RegExp(`^seed ${today}$`) }).first()).toBeVisible();
  await expect.poll(async () => (await readStoredAttempt(page)).attemptId).not.toBe(saved.attemptId);
  expect((await readStoredAttempt(page)).cellEntries).toEqual({});
  await openSetup(page);
  await expect(page.getByText(/shared puzzle link was invalid/i)).toBeVisible();
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
