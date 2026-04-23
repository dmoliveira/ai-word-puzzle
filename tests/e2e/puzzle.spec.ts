import { expect, test } from "@playwright/test";

test("player can reveal a review answer and solve the active clue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(/crossword-style english puzzle runs/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Fresh Run" })).toBeVisible();
  await expect(page.getByTestId("progress-label")).toContainText("0/");

  await page.getByRole("button", { name: "Review Word" }).click();
  const cleanedAnswer = ((await page.getByTestId("review-word-answer").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("active-answer-input").fill(cleanedAnswer);
  await expect(page.getByTestId("progress-label")).not.toContainText("0/");
  await expect(page.getByText("Daily Archive")).toBeVisible();
});

test("player can reveal a letter, clear a clue, and move to the next clue", async ({ page }) => {
  await page.goto("/");

  const startingBadge = ((await page.getByTestId("active-clue-badge").textContent()) ?? "").trim();
  await page.getByRole("button", { name: "Reveal letter" }).click();
  await expect(page.getByTestId("active-answer-input")).not.toHaveValue("");

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
  await expect(page.getByText("Active clue")).toBeVisible();

  await page.getByRole("button", { name: "Clues" }).click();
  await expect(page.getByRole("heading", { name: "Clues" })).toBeVisible();
  await expect(page.getByText("Daily Archive")).not.toBeVisible();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Daily Archive" })).toBeVisible();

  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.getByText("Active clue")).toBeVisible();
});
