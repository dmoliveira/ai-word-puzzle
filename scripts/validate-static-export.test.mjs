import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { validateStaticExport } from "./validate-static-export.mjs";

const siteUrl = "https://example.com/app/";
const basePath = "/app";

function png(width, height) {
  const image = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}

function ico() {
  const image = Buffer.alloc(22);
  image.writeUInt16LE(0, 0);
  image.writeUInt16LE(1, 2);
  image.writeUInt16LE(1, 4);
  image[6] = 32;
  image[7] = 32;
  return image;
}

function write(root, path, content = "") {
  const destination = join(root, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "astra-export-"));
  const head = [
    '<title>Astra Lexa — Daily Crossword & Word Quest</title>',
    '<link rel="canonical" href="https://example.com/app/">',
    '<link rel="manifest" href="/app/manifest.webmanifest">',
    '<link rel="icon" href="/app/favicon.ico?cache=1">',
    '<link rel="apple-touch-icon" href="/app/apple-icon.png?cache=1">',
    '<meta name="description" content="Play a free daily crossword or create a seeded word quest with accessible keyboard, touch, hints, review, and browser-local progress.">',
    '<meta name="robots" content="index, follow">',
    '<meta property="og:url" content="https://example.com/app/">',
    '<meta property="og:title" content="Astra Lexa — Daily Crossword & Word Quest">',
    '<meta property="og:description" content="Play a free daily crossword or create a seeded word quest with accessible keyboard, touch, hints, review, and browser-local progress.">',
    '<meta property="og:image" content="https://example.com/app/og-image.png">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Astra Lexa — Daily Crossword & Word Quest">',
    '<meta name="twitter:description" content="Play a free daily crossword or create a seeded word quest with accessible keyboard, touch, hints, review, and browser-local progress.">',
    '<meta name="twitter:image" content="https://example.com/app/og-image.png">',
  ].join("");
  const html = `<html><head>${head}<script src="/app/_next/main.js"></script></head><body><h1>Astra Lexa daily crossword and word quest</h1><main id="puzzle-studio"></main></body></html>`;
  write(root, "index.html", html);
  write(root, "404.html", '<html><head><script src="/app/_next/main.js"></script></head><body></body></html>');
  write(root, "_next/main.js", "");
  write(root, "manifest.webmanifest", JSON.stringify({
    id: "/app/",
    name: "Astra Lexa — Daily Crossword & Word Quest",
    short_name: "Astra Lexa",
    description: "Accessible daily crossword and word quest fixture for export validation.",
    start_url: "/app/",
    scope: "/app/",
    display: "standalone",
    background_color: "#020817",
    theme_color: "#020817",
    icons: [
      { src: "/app/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }));
  write(root, "robots.txt", "User-Agent: *\nAllow: /\n\nSitemap: https://example.com/app/sitemap.xml\n");
  write(root, "sitemap.xml", "<urlset><url><loc>https://example.com/app/</loc></url></urlset>");
  write(root, "favicon.ico", ico());
  write(root, "icon.svg", "<svg></svg>");
  write(root, "apple-icon.png", png(180, 180));
  write(root, "icon-192.png", png(192, 192));
  write(root, "icon-512.png", png(512, 512));
  write(root, "og-image.png", png(1200, 630));
  write(root, ".nojekyll", "");
  return root;
}

test("validator accepts a complete project-path artifact", () => {
  const root = createFixture();
  try {
    assert.equal(validateStaticExport({ outputDir: root, expectedSiteUrl: siteUrl, expectedBasePath: basePath, requireNoJekyll: true }).basePath, basePath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validator rejects canonical, base-path, and missing-asset tampering", () => {
  const mutations = [
    (root) => write(root, "index.html", read(root, "index.html").replace(siteUrl, "https://wrong.example/")),
    (root) => write(root, "index.html", read(root, "index.html").replace("/app/_next/main.js", "/_next/main.js")),
    (root) => write(root, "index.html", read(root, "index.html").replace("/app/_next/main.js", "/app/%2e%2e/secret.txt")),
    (root) => rmSync(join(root, "og-image.png")),
  ];

  for (const mutate of mutations) {
    const root = createFixture();
    try {
      mutate(root);
      assert.throws(() => validateStaticExport({ outputDir: root, expectedSiteUrl: siteUrl, expectedBasePath: basePath }));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function read(root, path) {
  return readFileSync(join(root, path), "utf8");
}
