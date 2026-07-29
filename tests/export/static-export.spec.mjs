import { expect, test } from "@playwright/test";
import { smokeDeployment } from "../../scripts/smoke-deployment.mjs";

const configuredSiteUrl = new URL(process.env.EXPECTED_SITE_URL ?? "https://dmoliveira.github.io/ai-word-puzzle/");
configuredSiteUrl.pathname = `${configuredSiteUrl.pathname.replace(/\/+$/, "")}/`;
const expectedSiteUrl = configuredSiteUrl.href;
const expectedBasePath = process.env.EXPECTED_BASE_PATH ?? "";

test("mounted static export stays date-neutral, hydrates, and keeps deployment URLs intact", async ({ page, request, baseURL }) => {
  const rawResponse = await request.get(baseURL);
  const rawHtml = await rawResponse.text();
  expect(rawHtml).toContain('data-bootstrap-state="pending"');
  expect(rawHtml).toContain('data-run-state="none"');
  expect(rawHtml).not.toContain('data-bootstrap-state="ready"');
  expect(rawHtml).not.toContain('data-testid="active-answer-input"');
  expect(rawHtml).not.toContain('data-testid="progress-label"');

  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => failures.push(`request: ${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => {
    if (new URL(response.url()).origin === new URL(baseURL).origin && response.status() >= 400) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  });

  const runtimeNow = Date.parse("2040-02-29T12:00:00.000Z");
  await page.addInitScript((nowMs) => {
    Date.now = () => nowMs;
  }, runtimeNow);
  await page.goto(baseURL);
  await expect(page.getByRole("heading", { level: 1, name: "Astra Lexa daily crossword and word quest" })).toHaveCount(1);
  await expect(page.locator('main#puzzle-studio[data-bootstrap-state="ready"][data-run-state="prepared"]')).toBeVisible();
  await expect(page.getByTestId("run-seed")).toContainText("2040-02-29");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expectedSiteUrl);
  const manifestPath = `${expectedBasePath}/manifest.webmanifest` || "/manifest.webmanifest";
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", manifestPath);
  const manifest = await page.evaluate(async (path) => (await fetch(`${location.origin}${path}`)).json(), manifestPath);
  expect(manifest.start_url).toBe(`${expectedBasePath}/` || "/");
  await page.getByRole("link", { name: "Open the puzzle studio" }).click();
  await expect(page.locator("#puzzle-studio")).toBeVisible();
  expect(failures).toEqual([]);
});

test("deployment smoke parser validates the mounted artifact", async ({ baseURL }) => {
  const result = await smokeDeployment({ deploymentUrl: baseURL, expectedSiteUrl, attempts: 1 });
  expect(result.deploymentUrl).toBe(baseURL);
  expect(result.nextUrl).toContain(`${expectedBasePath}/_next/` || "/_next/");
});
