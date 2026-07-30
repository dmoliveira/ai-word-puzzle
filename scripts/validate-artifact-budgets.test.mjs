import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureArtifactBudgets } from "./validate-artifact-budgets.mjs";

for (const basePath of ["", "/ai-word-puzzle"]) {
  test(`artifact parser deduplicates script and preload references for ${basePath || "root"}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "astra-artifacts-"));
    try {
      mkdirSync(join(directory, "_next", "static"), { recursive: true });
      writeFileSync(join(directory, "_next", "static", "initial.js"), "globalThis.initial=true;");
      writeFileSync(join(directory, "_next", "static", "lazy.js"), "globalThis.lazy=true;");
      writeFileSync(join(directory, "_next", "static", "legacy.js"), "globalThis.legacy=true;");
      const initialUrl = `${basePath}/_next/static/initial.js`;
      writeFileSync(join(directory, "index.html"), `<link rel="preload" as="script" href="${initialUrl}"><link rel="modulepreload" href="${initialUrl}"><script src="${initialUrl}"></script><script src="${basePath}/_next/static/legacy.js" noModule></script>`);
      const result = measureArtifactBudgets({ outputDir: directory, expectedBasePath: basePath });
      assert.equal(result.initialJavaScriptFiles, 1);
      assert.equal(result.JavaScriptFiles, 3);
      assert.ok(result.initialJavaScriptGzipBytes > 0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
