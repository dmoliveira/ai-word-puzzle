import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const productionSiteUrl = "https://dmoliveira.github.io/ai-word-puzzle/";
const stableHeading = "Astra Lexa daily crossword and word quest";
const stableTitle = "Astra Lexa — Daily Crossword & Word Quest";
const stableDescription = "Play a free daily crossword or create a seeded word quest with accessible keyboard, touch, hints, review, and browser-local progress.";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeExpectedSiteUrl(rawValue) {
  const url = new URL(rawValue);
  invariant(["http:", "https:"].includes(url.protocol), "EXPECTED_SITE_URL must use HTTP(S).");
  invariant(!url.username && !url.password && !url.search && !url.hash, "EXPECTED_SITE_URL must not contain credentials, a query, or a fragment.");
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

function normalizeExpectedBasePath(rawValue = "") {
  const basePath = rawValue.trim();
  invariant(basePath === "" || (basePath.startsWith("/") && !basePath.endsWith("/") && !/\/\/|[?#\s]/.test(basePath)), "EXPECTED_BASE_PATH is invalid.");
  return basePath;
}

function readRequired(pathname) {
  invariant(existsSync(pathname), `Missing exported artifact: ${pathname}`);
  return readFileSync(pathname);
}

function readText(pathname) {
  return readRequired(pathname).toString("utf8");
}

function getTags(html, tagName) {
  return html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
}

function decodeHtml(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (entity, code) => {
    if (code.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function getAttribute(tag, name) {
  const value = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1];
  return value === undefined ? null : decodeHtml(value);
}

function findMeta(html, key, value) {
  return getTags(html, "meta").find((tag) => getAttribute(tag, key) === value) ?? null;
}

function findLinks(html, rel) {
  return getTags(html, "link").filter((tag) => getAttribute(tag, "rel")?.split(/\s+/).includes(rel));
}

function getHtmlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...getHtmlFiles(pathname));
    } else if (entry.name.endsWith(".html")) {
      files.push(pathname);
    }
  }
  return files;
}

function localPathFromUrl(rawUrl, basePath) {
  if (!rawUrl.startsWith("/") || rawUrl.startsWith("//")) {
    return null;
  }
  const rawPath = rawUrl.split(/[?#]/, 1)[0];
  let decodedRawPath;
  try {
    decodedRawPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error(`Local URL contains invalid encoding: ${rawUrl}`);
  }
  const rawSegments = decodedRawPath.replaceAll("\\", "/").split("/");
  invariant(!decodedRawPath.includes("\\") && !/\/\//.test(decodedRawPath) && !rawSegments.some((segment) => segment === "." || segment === ".."), `Local URL contains an unsafe path: ${rawUrl}`);

  const parsed = new URL(rawUrl, "https://artifact.invalid");
  if (basePath) {
    invariant(parsed.pathname === basePath || parsed.pathname.startsWith(`${basePath}/`), `Local URL is missing expected base path ${basePath}: ${rawUrl}`);
  }
  const stripped = basePath && parsed.pathname.startsWith(basePath) ? parsed.pathname.slice(basePath.length) : parsed.pathname;
  const decoded = decodeURIComponent(stripped || "/");
  const segments = decoded.split("/");
  invariant(!decoded.includes("\\") && !/\/\//.test(decoded) && !segments.some((segment) => segment === "." || segment === ".."), `Resolved local URL contains an unsafe path: ${rawUrl}`);
  return decoded;
}

function assertLocalReference(outputDir, rawUrl, basePath, sourceFile) {
  const pathname = localPathFromUrl(rawUrl, basePath);
  if (!pathname || pathname === "/") {
    return;
  }
  const relativePath = pathname.replace(/^\//, "");
  const candidates = [resolve(outputDir, relativePath)];
  if (pathname.endsWith("/")) {
    candidates.push(resolve(outputDir, relativePath, "index.html"));
  }
  const artifactRoot = `${resolve(outputDir)}${sep}`;
  invariant(candidates.every((candidate) => candidate.startsWith(artifactRoot)), `Local reference escapes the export directory in ${sourceFile}: ${rawUrl}`);
  invariant(candidates.some(existsSync), `Broken local reference in ${sourceFile}: ${rawUrl}`);
}

function assertPng(pathname, width, height) {
  const image = readRequired(pathname);
  invariant(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${pathname} is not a PNG.`);
  invariant(image.length >= 24 && image.readUInt32BE(16) === width && image.readUInt32BE(20) === height, `${pathname} must be ${width}x${height}.`);
}

function assertIco(pathname) {
  const image = readRequired(pathname);
  invariant(image.length >= 22 && image.readUInt16LE(0) === 0 && image.readUInt16LE(2) === 1 && image.readUInt16LE(4) >= 1, `${pathname} is not a valid ICO directory.`);
  invariant((image[6] || 256) === 32 && (image[7] || 256) === 32, `${pathname} must include a 32x32 favicon entry.`);
}

export function validateStaticExport({
  outputDir = "out",
  expectedSiteUrl = productionSiteUrl,
  expectedBasePath = "",
  allowSitePathMismatch = false,
  requireNoJekyll = false,
} = {}) {
  const directory = resolve(outputDir);
  const siteUrl = normalizeExpectedSiteUrl(expectedSiteUrl);
  const basePath = normalizeExpectedBasePath(expectedBasePath);
  const publicPath = siteUrl.pathname === "/" ? "" : siteUrl.pathname.replace(/\/$/, "");
  invariant(allowSitePathMismatch || publicPath === basePath, `Expected SITE_URL pathname (${publicPath || "/"}) to equal EXPECTED_BASE_PATH (${basePath || "/"}).`);

  const requiredFiles = ["index.html", "404.html", "manifest.webmanifest", "robots.txt", "sitemap.xml", "favicon.ico", "icon.svg", "apple-icon.png", "icon-192.png", "icon-512.png", "og-image.png"];
  for (const file of requiredFiles) {
    readRequired(resolve(directory, file));
  }
  if (requireNoJekyll) {
    readRequired(resolve(directory, ".nojekyll"));
  }

  const indexHtml = readText(resolve(directory, "index.html"));
  invariant(!/localhost|127\.0\.0\.1/i.test(indexHtml), "Exported index contains a local development URL.");
  invariant((indexHtml.match(/<h1\b/gi) ?? []).length === 1 && indexHtml.includes(`>${stableHeading}</h1>`), "Exported index must contain exactly one stable Astra Lexa H1.");
  const title = indexHtml.match(/<title>([^<]*)<\/title>/i)?.[1];
  invariant(title && decodeHtml(title) === stableTitle, "Exported title is missing or incorrect.");
  invariant(indexHtml.includes('id="puzzle-studio"'), "Exported index is missing the puzzle-studio anchor.");

  const canonicalLinks = findLinks(indexHtml, "canonical");
  invariant(canonicalLinks.length === 1 && getAttribute(canonicalLinks[0], "href") === siteUrl.toString(), "Exported canonical URL is missing or incorrect.");
  const manifestLinks = findLinks(indexHtml, "manifest");
  const expectedManifestHref = `${basePath}/manifest.webmanifest` || "/manifest.webmanifest";
  invariant(manifestLinks.length === 1 && getAttribute(manifestLinks[0], "href") === expectedManifestHref, "Exported manifest link is missing, duplicated, or incorrect.");

  const ogUrl = findMeta(indexHtml, "property", "og:url");
  const ogImage = findMeta(indexHtml, "property", "og:image");
  const twitterCard = findMeta(indexHtml, "name", "twitter:card");
  const twitterImage = findMeta(indexHtml, "name", "twitter:image");
  const description = findMeta(indexHtml, "name", "description");
  invariant(getAttribute(ogUrl ?? "", "content") === siteUrl.toString(), "Open Graph URL is incorrect.");
  invariant(getAttribute(ogImage ?? "", "content") === new URL("og-image.png", siteUrl).toString(), "Open Graph image is incorrect.");
  invariant(getAttribute(twitterCard ?? "", "content") === "summary_large_image", "Twitter card metadata is incorrect.");
  invariant(getAttribute(twitterImage ?? "", "content") === new URL("og-image.png", siteUrl).toString(), "Twitter image metadata is incorrect.");
  invariant(getAttribute(description ?? "", "content") === stableDescription, "Description metadata is missing or incorrect.");
  invariant(getAttribute(findMeta(indexHtml, "property", "og:title") ?? "", "content") === stableTitle, "Open Graph title is incorrect.");
  invariant(getAttribute(findMeta(indexHtml, "property", "og:description") ?? "", "content") === stableDescription, "Open Graph description is incorrect.");
  invariant(getAttribute(findMeta(indexHtml, "name", "twitter:title") ?? "", "content") === stableTitle, "Twitter title is incorrect.");
  invariant(getAttribute(findMeta(indexHtml, "name", "twitter:description") ?? "", "content") === stableDescription, "Twitter description is incorrect.");
  invariant(findMeta(indexHtml, "name", "robots"), "Page robots metadata is missing.");
  invariant(findLinks(indexHtml, "icon").length >= 1 && findLinks(indexHtml, "apple-touch-icon").length === 1, "Icon metadata links are incomplete.");

  for (const htmlFile of getHtmlFiles(directory)) {
    const html = readText(htmlFile);
    const source = relative(directory, htmlFile);
    invariant(!/localhost|127\.0\.0\.1/i.test(html), `${source} contains a local development URL.`);
    const urls = [...getTags(html, "script"), ...getTags(html, "link"), ...getTags(html, "img")]
      .flatMap((tag) => [getAttribute(tag, "src"), getAttribute(tag, "href")])
      .filter(Boolean);
    for (const url of urls) {
      if (url.includes("/_next/")) {
        const expectedPrefix = `${basePath}/_next/` || "/_next/";
        invariant(url.startsWith(expectedPrefix), `Next asset URL has the wrong base path in ${source}: ${url}`);
        if (basePath) {
          invariant(!url.startsWith("/_next/"), `Bare /_next URL found in Pages artifact: ${url}`);
        }
      }
      assertLocalReference(directory, url, basePath, source);
    }
  }

  const runtimeRoot = `${basePath}/` || "/";
  const manifest = JSON.parse(readText(resolve(directory, "manifest.webmanifest")));
  invariant(manifest.name === stableTitle && manifest.short_name === "Astra Lexa" && typeof manifest.description === "string" && manifest.description.length > 40, "Manifest identity or description is incorrect.");
  invariant(manifest.id === runtimeRoot && manifest.start_url === runtimeRoot && manifest.scope === runtimeRoot, "Manifest id/start_url/scope are incorrect.");
  invariant(manifest.display === "standalone" && manifest.background_color === "#020817" && manifest.theme_color === "#020817", "Manifest display or colors are incorrect.");
  invariant(JSON.stringify(manifest.icons) === JSON.stringify([
    { src: `${basePath}/icon-192.png`, sizes: "192x192", type: "image/png" },
    { src: `${basePath}/icon-512.png`, sizes: "512x512", type: "image/png" },
  ]), "Manifest icons are incorrect.");

  const sitemapUrl = new URL("sitemap.xml", siteUrl).toString();
  invariant(readText(resolve(directory, "robots.txt")).includes(`Sitemap: ${sitemapUrl}`), "robots.txt sitemap URL is incorrect.");
  invariant(readText(resolve(directory, "sitemap.xml")).includes(`<loc>${siteUrl.toString()}</loc>`), "Sitemap canonical URL is incorrect.");

  assertPng(resolve(directory, "apple-icon.png"), 180, 180);
  assertPng(resolve(directory, "icon-192.png"), 192, 192);
  assertPng(resolve(directory, "icon-512.png"), 512, 512);
  assertPng(resolve(directory, "og-image.png"), 1200, 630);
  assertIco(resolve(directory, "favicon.ico"));

  return { htmlFiles: getHtmlFiles(directory).length, basePath, siteUrl: siteUrl.toString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const explicitSiteUrl = process.env.EXPECTED_SITE_URL;
  const result = validateStaticExport({
    outputDir: process.env.EXPORT_DIR ?? "out",
    expectedSiteUrl: explicitSiteUrl ?? productionSiteUrl,
    expectedBasePath: process.env.EXPECTED_BASE_PATH ?? "",
    allowSitePathMismatch: process.env.ALLOW_SITE_PATH_MISMATCH === "true" || !explicitSiteUrl,
    requireNoJekyll: process.env.REQUIRE_NOJEKYLL === "true",
  });
  console.log(`Validated ${result.htmlFiles} HTML files for ${result.siteUrl} (base path: ${result.basePath || "/"}).`);
}
