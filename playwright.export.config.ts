import { defineConfig, devices } from "@playwright/test";

const basePath = process.env.EXPECTED_BASE_PATH ?? "";
const port = Number(process.env.EXPORT_PORT ?? 3201);

export default defineConfig({
  testDir: "./tests/export",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}${basePath}/`,
  },
  webServer: {
    command: "node scripts/serve-static-export.mjs",
    env: {
      EXPORT_BASE_PATH: basePath,
      EXPORT_DIR: process.env.EXPORT_DIR ?? "out",
      EXPORT_PORT: String(port),
    },
    url: `http://127.0.0.1:${port}${basePath}/`,
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: "chromium-export", use: { ...devices["Desktop Chrome"] } }],
});
