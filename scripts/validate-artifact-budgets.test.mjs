import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function deterministicNoise(bytes) {
  let value = "";
  for (let index = 0; value.length < bytes; index += 1) {
    value += createHash("sha256").update(String(index)).digest("base64");
  }
  return `globalThis.payload="${value.slice(0, bytes)}";`;
}

function withArtifactFixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "astra-artifact-limit-"));
  try {
    mkdirSync(join(directory, "_next"), { recursive: true });
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("artifact budgets reject oversized HTML", () => {
  withArtifactFixture((directory) => {
    writeFileSync(join(directory, "index.html"), "x".repeat(45 * 1024 + 1));
    assert.throws(() => measureArtifactBudgets({ outputDir: directory }), /index\.html is .* budget is 46080/);
  });
});

test("artifact budgets reject oversized aggregate initial JavaScript", () => {
  withArtifactFixture((directory) => {
    const urls = ["/_next/first.js", "/_next/second.js"];
    writeFileSync(join(directory, "index.html"), urls.map((url) => `<script src="${url}"></script>`).join(""));
    for (const filename of ["first.js", "second.js"]) writeFileSync(join(directory, "_next", filename), deterministicNoise(160 * 1024));
    assert.throws(() => measureArtifactBudgets({ outputDir: directory }), /Initial JavaScript is .* budget is 225280/);
  });
});

test("artifact budgets reject an oversized lazy JavaScript chunk", () => {
  withArtifactFixture((directory) => {
    writeFileSync(join(directory, "index.html"), "<script src=\"/_next/initial.js\"></script>");
    writeFileSync(join(directory, "_next", "initial.js"), "globalThis.initial=true;");
    writeFileSync(join(directory, "_next", "lazy.js"), deterministicNoise(360 * 1024));
    assert.throws(() => measureArtifactBudgets({ outputDir: directory }), /JavaScript chunk .*lazy\.js is .* budget is 256000/);
  });
});

test("Pages workflow enforces artifact budgets in the validated upload sequence", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  const orderedSteps = [
    "Build static site",
    "Validate Pages artifact",
    "Enforce artifact budgets",
    "Test mounted Pages artifact",
    "Upload Pages artifact",
  ];
  const positions = orderedSteps.map((name) => workflow.indexOf(`      - name: ${name}`));
  assert.ok(positions.every((position) => position >= 0), "every artifact delivery step must exist");
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, "artifact delivery steps must remain in fail-closed order");
  assert.equal(workflow.match(/      - name: Enforce artifact budgets/g)?.length, 1);
  const budgetStep = workflow.slice(positions[2], positions[3]);
  assert.match(budgetStep, /EXPECTED_BASE_PATH: \$\{\{ steps\.pages\.outputs\.base_path \}\}/);
  assert.match(budgetStep, /run: npm run validate:artifacts/);
});
