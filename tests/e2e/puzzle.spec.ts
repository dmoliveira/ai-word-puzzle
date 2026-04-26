import { expect, test } from "@playwright/test";

async function openWordReview(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Review Word" }).click();
  await page.getByRole("button", { name: "Reveal word" }).click();
}

test("player can reveal a review answer and solve the active clue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/Today's Quest/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Fresh Run" })).toBeVisible();
  await expect(page.getByTestId("progress-label")).toContainText("0/");

  await openWordReview(page);
  const cleanedAnswer = ((await page.getByTestId("review-word-answer").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("active-answer-input").fill(cleanedAnswer);
  await expect(page.getByTestId("progress-label")).not.toContainText("0/");
  await page.getByTestId("toggle-right-panel").click();
  await expect(page.getByText("Daily Archive")).toBeVisible();
});

test("player can reveal a letter, clear a clue, and move to the next clue", async ({ page }) => {
  await page.goto("/");

  const startingBadge = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Reveal letter" }).click();
  await expect(page.getByTestId("active-answer-input")).not.toHaveValue("");
  await page.getByRole("button", { name: "Show scramble" }).click();
  await expect(page.getByText(/^Scramble:/)).toBeVisible();

  await page.getByRole("button", { name: "Clear word" }).click();
  await expect(page.getByTestId("active-answer-input")).toHaveValue("");

  await page.getByRole("button", { name: "Next clue" }).click();
  await expect(page.getByTestId("active-clue-badge")).not.toHaveText(startingBadge);

  const movedBadge = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  await page.getByTestId("active-answer-input").press("ArrowLeft");
  await expect(page.getByTestId("active-clue-badge")).toHaveText(startingBadge);

  await page.getByTestId("active-answer-input").press("Enter");
  await expect(page.getByTestId("active-clue-badge")).toHaveText(movedBadge);
});

test("player can type and navigate directly on the board grid", async ({ page }) => {
  await page.goto("/");

  const firstFilledCell = page.locator('[data-testid^="board-cell-"]').first();
  await firstFilledCell.click();
  await firstFilledCell.press("A");
  await expect(firstFilledCell).toContainText("A");

  const firstBadge = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  const startingCellId = await page.locator(':focus').getAttribute("data-testid");
  await firstFilledCell.press("ArrowRight");
  let currentFocusedId = await page.locator(':focus').getAttribute("data-testid");

  if (currentFocusedId === startingCellId) {
    await page.locator(':focus').press("ArrowDown");
    currentFocusedId = await page.locator(':focus').getAttribute("data-testid");
  }

  expect(currentFocusedId).not.toBe(startingCellId);

  await page.locator(':focus').press("Backspace");
  await page.locator(':focus').press("Enter");
  await expect(page.getByTestId("active-clue-badge")).not.toHaveText(firstBadge);
});

test("mobile player can switch between board, clues, and archive panels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Board" })).toBeVisible();
  await expect(page.getByText("Clue", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clues" }).click();
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();
  await expect(page.getByText("Daily Archive")).not.toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Daily Archive" })).toBeVisible();

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.getByText("Clue", { exact: true })).toBeVisible();
});

test("player sees completion stats after clearing the full puzzle", async ({ page }) => {
  await page.goto("/");

  for (let index = 0; index < 7; index += 1) {
    await openWordReview(page);
    const answer = ((await page.getByTestId("review-word-answer").textContent()) ?? "").trim();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("active-answer-input").fill(answer);
  }

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByText("Share run link")).toBeVisible();
  await expect(page.getByText("Copy result text")).toBeVisible();
});

test("shared daily link reopens the requested seeded run", async ({ page }) => {
  await page.goto("/?mode=daily&seed=2026-04-24&topics=myth,greek&challenge=quest&style=alpha&puzzleSize=7&clueDensity=2&timerEnabled=true");

  await expect(page.locator('span').filter({ hasText: /^seed 2026-04-24$/ }).first()).toBeVisible();
  await expect(page.locator('span').filter({ hasText: /^daily$/ }).first()).toBeVisible();
});

test("daily run completion exposes the daily share action", async ({ page }) => {
  await page.goto("/?mode=daily&seed=2026-04-24&topics=myth,greek&challenge=quest&style=alpha&puzzleSize=7&clueDensity=2&timerEnabled=true");

  for (let index = 0; index < 7; index += 1) {
    await openWordReview(page);
    const answer = ((await page.getByTestId("review-word-answer").textContent()) ?? "").trim();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByTestId("active-answer-input").fill(answer);
  }

  await expect(page.getByTestId("completion-card")).toBeVisible();
  await expect(page.getByText("Share daily result")).toBeVisible();
});

test("history filters narrow the recent runs list", async ({ page }) => {
  await page.goto("/?mode=daily&seed=2026-04-24&topics=myth,greek&challenge=quest&style=alpha&puzzleSize=7&clueDensity=2&timerEnabled=true");

  await page.getByRole("button", { name: "Start Fresh Run" }).click();
  await page.getByRole("button", { name: "Spin random custom" }).click();
  await page.getByTestId("toggle-right-panel").click();
  await page.getByTestId("history-mode-daily").click();
  await expect(page.getByText("No runs match the current filters yet.")).not.toBeVisible();
  await page.getByTestId("history-mode-custom").click();
  await expect(page.getByTestId("recent-run-card").first()).toContainText(/seed custom-/i);
});

test("archive insights panel is visible", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("toggle-right-panel").click();
  await expect(page.getByRole("heading", { name: "Archive Insights" })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Finished runs$/ })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Last 7 days$/ })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Last 30 days$/ })).toBeVisible();
});

test("word review exposes vocabulary support for learners", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Show advanced" }).click();
  await page.getByLabel("Learning mode").check();
  await openWordReview(page);
  await expect(page.getByTestId("review-vocabulary-support")).toBeVisible();
  await expect(page.getByTestId("review-vocabulary-support")).toContainText(/Example:/);
  await expect(page.getByTestId("review-vocabulary-support")).toContainText(/Plain meaning:/);
  await expect(page.getByTestId("review-vocabulary-support")).toContainText(/Pronunciation:/);
  await expect(page.getByTestId("review-vocabulary-support").getByRole("button", { name: "Speak" })).toBeVisible();
});

test("quest view renders a full letter grid", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Show advanced" }).click();
  await page.getByLabel("Board View").selectOption("quest");
  await expect(page.getByText(/Trace a straight path across the full grid/i)).toBeVisible();
  await expect(page.locator('[data-testid^="board-cell-"]')).toHaveCount(196);
});

test("quest view can solve the active word by selecting its path", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Show advanced" }).click();
  await page.getByLabel("Board View").selectOption("quest");

  const activeCells = page.locator('[data-active-cell="true"]');
  const count = await activeCells.count();
  await activeCells.nth(0).hover();
  await page.mouse.down();
  await activeCells.nth(count - 1).hover();
  await page.mouse.up();

  await expect(page.getByTestId("progress-label")).not.toContainText("0/");
});
