import assert from "node:assert/strict";
import test from "node:test";
import { createSiteConfig, defaultSiteUrl } from "@/lib/site-config";

test("local root mode keeps the production canonical without a runtime base path", () => {
  const config = createSiteConfig({});

  assert.equal(config.canonicalUrl, defaultSiteUrl);
  assert.equal(config.basePath, "");
  assert.equal(config.runtimePath("/"), "/");
  assert.equal(config.runtimePath("/icon-192.png"), "/icon-192.png");
  assert.equal(config.publicUrl("og-image.png").toString(), `${defaultSiteUrl}og-image.png`);
});

test("project Pages mode separates absolute URLs from runtime paths", () => {
  const config = createSiteConfig({
    SITE_URL: "https://dmoliveira.github.io/ai-word-puzzle",
    PAGES_BASE_PATH: "/ai-word-puzzle",
  });

  assert.equal(config.canonicalUrl, defaultSiteUrl);
  assert.equal(config.runtimePath("/"), "/ai-word-puzzle/");
  assert.equal(config.runtimePath("/manifest.webmanifest"), "/ai-word-puzzle/manifest.webmanifest");
  assert.equal(config.publicUrl("sitemap.xml").toString(), `${defaultSiteUrl}sitemap.xml`);
});

test("a direct custom domain uses origin-root runtime paths", () => {
  const config = createSiteConfig({ SITE_URL: "https://puzzle.example.com/", PAGES_BASE_PATH: "" });

  assert.equal(config.canonicalUrl, "https://puzzle.example.com/");
  assert.equal(config.runtimePath("/"), "/");
});

test("an explicit project URL cannot silently lose its deployment base path", () => {
  assert.throws(
    () => createSiteConfig({ SITE_URL: "https://dmoliveira.github.io/ai-word-puzzle/", PAGES_BASE_PATH: "" }),
    /must exactly match/,
  );
});

test("site configuration rejects unsafe or ambiguous inputs", () => {
  const invalidEnvironments = [
    { SITE_URL: "https://user:pass@example.com/", PAGES_BASE_PATH: "" },
    { SITE_URL: "https://example.com/?preview=true", PAGES_BASE_PATH: "" },
    { SITE_URL: "https://example.com/#preview", PAGES_BASE_PATH: "" },
    { SITE_URL: "https://example.com/a//b/", PAGES_BASE_PATH: "/a/b" },
    { SITE_URL: "https://example.com/a/../b/", PAGES_BASE_PATH: "/b" },
    { SITE_URL: "ftp://example.com/", PAGES_BASE_PATH: "" },
    { SITE_URL: "https://example.com/app/", PAGES_BASE_PATH: "app" },
    { SITE_URL: "https://example.com/app/", PAGES_BASE_PATH: "/app/" },
    { SITE_URL: "https://example.com/app/", PAGES_BASE_PATH: "/app//nested" },
    { SITE_URL: "https://example.com/app/", PAGES_BASE_PATH: "/app?x=1" },
  ];

  for (const environment of invalidEnvironments) {
    assert.throws(() => createSiteConfig(environment));
  }
});
