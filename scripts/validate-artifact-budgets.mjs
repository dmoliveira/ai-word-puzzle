import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export const artifactBudgets = Object.freeze({
  htmlBytes: 45 * 1024,
  initialJavaScriptGzipBytes: 220 * 1024,
  chunkGzipBytes: 250 * 1024,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function getAttribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? null;
}

function normalizeBasePath(value = "") {
  const basePath = value.trim();
  invariant(basePath === "" || (basePath.startsWith("/") && !basePath.endsWith("/") && !/\/\/|[?#\s]/.test(basePath)), "EXPECTED_BASE_PATH is invalid.");
  return basePath;
}

function getJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const pathname = resolve(directory, entry.name);
    if (entry.isDirectory()) return getJavaScriptFiles(pathname);
    return entry.name.endsWith(".js") ? [pathname] : [];
  });
}

function localAssetPath(rawUrl, basePath, outputDir) {
  const url = new URL(rawUrl, "https://artifact.invalid");
  invariant(url.origin === "https://artifact.invalid", `Initial JavaScript must be a local artifact: ${rawUrl}`);
  invariant(!basePath || url.pathname.startsWith(`${basePath}/`), `Initial JavaScript is missing expected base path ${basePath}: ${rawUrl}`);
  const stripped = basePath ? url.pathname.slice(basePath.length) : url.pathname;
  const relativePath = decodeURIComponent(stripped).replace(/^\/+/, "");
  invariant(relativePath && !relativePath.split("/").some((segment) => segment === "." || segment === ".."), `Unsafe initial JavaScript path: ${rawUrl}`);
  const pathname = resolve(outputDir, relativePath);
  invariant(pathname.startsWith(`${resolve(outputDir)}${sep}`), `Initial JavaScript escapes the export: ${rawUrl}`);
  invariant(existsSync(pathname) && statSync(pathname).isFile(), `Missing initial JavaScript artifact: ${rawUrl}`);
  return pathname;
}

export function measureArtifactBudgets({ outputDir = "out", expectedBasePath = "" } = {}) {
  const directory = resolve(outputDir);
  const basePath = normalizeBasePath(expectedBasePath);
  const indexPath = resolve(directory, "index.html");
  invariant(existsSync(indexPath), `Missing exported artifact: ${indexPath}`);
  const html = readFileSync(indexPath);
  const htmlText = html.toString("utf8");
  const scriptUrls = (htmlText.match(/<script\b[^>]*>/gi) ?? [])
    .filter((tag) => !/\bnomodule(?:\s|=|>)/i.test(tag))
    .map((tag) => getAttribute(tag, "src"))
    .filter(Boolean);
  const preloadUrls = (htmlText.match(/<link\b[^>]*>/gi) ?? [])
    .filter((tag) => {
      const rel = getAttribute(tag, "rel")?.split(/\s+/) ?? [];
      return rel.includes("modulepreload") || (rel.includes("preload") && getAttribute(tag, "as") === "script");
    })
    .map((tag) => getAttribute(tag, "href"))
    .filter(Boolean);
  const initialFiles = [...new Set([...scriptUrls, ...preloadUrls])]
    .filter((url) => new URL(url, "https://artifact.invalid").pathname.endsWith(".js"))
    .map((url) => localAssetPath(url, basePath, directory));
  const gzipBytes = (pathname) => gzipSync(readFileSync(pathname), { level: 9 }).byteLength;
  const chunks = getJavaScriptFiles(directory).map((pathname) => ({ pathname, gzipBytes: gzipBytes(pathname) }));
  const result = {
    htmlBytes: html.byteLength,
    initialJavaScriptFiles: initialFiles.length,
    initialJavaScriptGzipBytes: initialFiles.reduce((total, pathname) => total + gzipBytes(pathname), 0),
    largestChunkGzipBytes: Math.max(0, ...chunks.map((chunk) => chunk.gzipBytes)),
    JavaScriptFiles: chunks.length,
  };
  invariant(result.htmlBytes <= artifactBudgets.htmlBytes, `index.html is ${result.htmlBytes} bytes; budget is ${artifactBudgets.htmlBytes}.`);
  invariant(result.initialJavaScriptGzipBytes <= artifactBudgets.initialJavaScriptGzipBytes, `Initial JavaScript is ${result.initialJavaScriptGzipBytes} gzip bytes; budget is ${artifactBudgets.initialJavaScriptGzipBytes}.`);
  const oversized = chunks.find((chunk) => chunk.gzipBytes > artifactBudgets.chunkGzipBytes);
  invariant(!oversized, `JavaScript chunk ${oversized?.pathname} is ${oversized?.gzipBytes} gzip bytes; budget is ${artifactBudgets.chunkGzipBytes}.`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = measureArtifactBudgets({ outputDir: process.env.EXPORT_DIR ?? "out", expectedBasePath: process.env.EXPECTED_BASE_PATH ?? "" });
  console.log(`Artifact budgets passed: HTML ${result.htmlBytes} B; initial JS ${result.initialJavaScriptGzipBytes} B gzip across ${result.initialJavaScriptFiles} files; largest of ${result.JavaScriptFiles} JS chunks ${result.largestChunkGzipBytes} B gzip.`);
}
