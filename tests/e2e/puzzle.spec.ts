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
