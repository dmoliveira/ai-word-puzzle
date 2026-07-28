import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stableHeading = "Astra Lexa daily crossword and word quest";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchExpected(url, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  invariant(response.ok, `Could not fetch ${url}: ${response.status} ${response.statusText}`);
  return response;
}

function findAttribute(html, tagName, attributeName, attributeValue, resultName) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  for (const tag of tags) {
    const selectorValue = tag.match(new RegExp(`\\b${attributeName}=["']([^"']*)["']`, "i"))?.[1];
    if (selectorValue === attributeValue) {
      return tag.match(new RegExp(`\\b${resultName}=["']([^"']*)["']`, "i"))?.[1] ?? null;
    }
  }
  return null;
}

async function smokeDeploymentOnce({ deploymentUrl, expectedSiteUrl, fetchImpl }) {
  const baseUrl = new URL(deploymentUrl);
  baseUrl.search = "";
  baseUrl.hash = "";
  baseUrl.pathname = baseUrl.pathname.endsWith("/") ? baseUrl.pathname : `${baseUrl.pathname}/`;
  const canonicalUrl = new URL(expectedSiteUrl);
  canonicalUrl.pathname = canonicalUrl.pathname.endsWith("/") ? canonicalUrl.pathname : `${canonicalUrl.pathname}/`;

  const rootResponse = await fetchExpected(baseUrl, fetchImpl);
  const html = await rootResponse.text();
  invariant(html.includes(`>${stableHeading}</h1>`), "Deployment root is missing the stable Astra Lexa H1.");
  invariant(findAttribute(html, "link", "rel", "canonical", "href") === canonicalUrl.toString(), "Deployment canonical URL is incorrect.");

  const manifestHref = findAttribute(html, "link", "rel", "manifest", "href");
  invariant(manifestHref, "Deployment is missing its manifest link.");
  const manifestUrl = new URL(manifestHref, baseUrl);
  invariant(manifestUrl.pathname.startsWith(baseUrl.pathname), "Manifest link is outside the deployed base path.");
  const manifest = await (await fetchExpected(manifestUrl, fetchImpl)).json();
  invariant(manifest.name === "Astra Lexa — Daily Crossword & Word Quest", "Deployed manifest identity is incorrect.");
  invariant(manifest.start_url === baseUrl.pathname && manifest.scope === baseUrl.pathname, "Deployed manifest start_url or scope is incorrect.");

  const scriptTags = html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) ?? [];
  const nextHref = scriptTags.map((tag) => tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]).find((href) => href?.includes("/_next/"));
  invariant(nextHref, "Deployment root has no Next.js chunk reference.");
  const nextUrl = new URL(nextHref, baseUrl);
  invariant(nextUrl.pathname.startsWith(`${baseUrl.pathname}_next/`), "Next.js chunk is outside the deployed base path.");
  await fetchExpected(nextUrl, fetchImpl);

  const sitemapUrl = new URL("sitemap.xml", baseUrl);
  const sitemap = await (await fetchExpected(sitemapUrl, fetchImpl)).text();
  invariant(sitemap.includes(`<loc>${canonicalUrl.toString()}</loc>`), "Deployed sitemap canonical URL is incorrect.");

  const socialImage = Buffer.from(await (await fetchExpected(new URL("og-image.png", baseUrl), fetchImpl)).arrayBuffer());
  invariant(socialImage.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "Deployed social image is not a PNG.");
  invariant(socialImage.readUInt32BE(16) === 1200 && socialImage.readUInt32BE(20) === 630, "Deployed social image dimensions are incorrect.");

  return { deploymentUrl: baseUrl.toString(), manifestUrl: manifestUrl.toString(), nextUrl: nextUrl.toString() };
}

export async function smokeDeployment({ deploymentUrl, expectedSiteUrl = deploymentUrl, attempts = 8, fetchImpl = fetch }) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await smokeDeploymentOnce({ deploymentUrl, expectedSiteUrl, fetchImpl });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(10_000, attempt * 1_500)));
      }
    }
  }
  throw new Error(`Deployment smoke failed after ${attempts} attempts: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const deploymentUrl = process.env.DEPLOYMENT_URL;
  invariant(deploymentUrl, "DEPLOYMENT_URL is required.");
  const result = await smokeDeployment({
    deploymentUrl,
    expectedSiteUrl: process.env.EXPECTED_SITE_URL ?? deploymentUrl,
    attempts: Number(process.env.SMOKE_ATTEMPTS ?? 8),
  });
  console.log(`Deployment smoke passed for ${result.deploymentUrl}`);
}
