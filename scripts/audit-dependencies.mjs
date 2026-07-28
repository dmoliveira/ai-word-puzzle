import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const allowedDevelopmentAdvisories = new Set(["GHSA-mh99-v99m-4gvg"]);
export const developmentExceptionExpiresOn = "2026-08-29";
export const allowedDevelopmentFindings = Object.freeze({
  "@eslint/config-array": { direct: false, nodes: ["node_modules/@eslint/config-array"] },
  "@eslint/eslintrc": { direct: false, nodes: ["node_modules/@eslint/eslintrc"] },
  "brace-expansion": { direct: false, nodes: ["node_modules/brace-expansion"] },
  eslint: { direct: true, nodes: ["node_modules/eslint"] },
  "eslint-config-next": { direct: true, nodes: ["node_modules/eslint-config-next"] },
  "eslint-plugin-import": { direct: false, nodes: ["node_modules/eslint-plugin-import"] },
  "eslint-plugin-jsx-a11y": { direct: false, nodes: ["node_modules/eslint-plugin-jsx-a11y"] },
  "eslint-plugin-react": { direct: false, nodes: ["node_modules/eslint-plugin-react"] },
  minimatch: { direct: false, nodes: ["node_modules/minimatch"] },
});

function getCounts(report, label) {
  const counts = report?.metadata?.vulnerabilities;
  if (!counts || !Number.isInteger(counts.total)) {
    throw new Error(`${label} audit did not return vulnerability metadata.`);
  }
  return counts;
}

function getAdvisoryId(via) {
  if (typeof via !== "object" || via === null || typeof via.url !== "string") {
    return null;
  }
  const match = via.url.match(/\/(GHSA-[a-z0-9-]+)$/i);
  return match?.[1] ?? `source:${String(via.source ?? "unknown")}`;
}

export function evaluateAuditReports({ production, full, today }) {
  const productionCounts = getCounts(production, "Production");
  if (productionCounts.total !== 0) {
    throw new Error(`Production dependency audit reported ${productionCounts.total} vulnerability finding(s).`);
  }

  const fullCounts = getCounts(full, "Full");
  if (fullCounts.total === 0) {
    return "production and development dependency audits are clean";
  }

  const findings = full.vulnerabilities ?? {};
  const actualNames = Object.keys(findings).sort();
  const expectedNames = Object.keys(allowedDevelopmentFindings).sort();
  const unexpectedNames = actualNames.filter((name) => !expectedNames.includes(name));
  const missingNames = expectedNames.filter((name) => !actualNames.includes(name));
  if (fullCounts.total !== actualNames.length || unexpectedNames.length > 0 || missingNames.length > 0) {
    throw new Error(
      `Full dependency audit finding set changed (unexpected: ${unexpectedNames.join(", ") || "none"}; missing: ${missingNames.join(", ") || "none"}).`,
    );
  }

  for (const name of expectedNames) {
    const finding = findings[name];
    const expected = allowedDevelopmentFindings[name];
    const actualNodes = [...(finding.nodes ?? [])].sort();
    if (finding.severity !== "high" || finding.isDirect !== expected.direct || JSON.stringify(actualNodes) !== JSON.stringify(expected.nodes)) {
      throw new Error(`Full dependency audit finding shape changed for ${name}.`);
    }
  }

  const advisoryIds = new Set();
  for (const finding of Object.values(findings)) {
    for (const via of finding.via ?? []) {
      const advisoryId = getAdvisoryId(via);
      if (advisoryId) advisoryIds.add(advisoryId);
    }
  }

  if (advisoryIds.size === 0) {
    throw new Error("Full dependency audit returned findings without an attributable advisory.");
  }

  const unexpected = [...advisoryIds].filter((id) => !allowedDevelopmentAdvisories.has(id));
  if (unexpected.length > 0) {
    throw new Error(`Full dependency audit reported unapproved advisory source(s): ${unexpected.join(", ")}.`);
  }

  if (today > developmentExceptionExpiresOn) {
    throw new Error(`Development audit exception expired on ${developmentExceptionExpiresOn}.`);
  }

  return `production dependencies are clean; accepted development-only ${[...advisoryIds].join(", ")} until ${developmentExceptionExpiresOn}`;
}

function runAudit(args) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["audit", "--json", ...args], {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) throw result.error;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm audit did not return JSON.${result.stderr ? ` ${result.stderr.trim()}` : ""}`);
  }
}

function main() {
  const production = runAudit(["--omit=dev"]);
  const full = runAudit([]);
  const today = new Date().toISOString().slice(0, 10);
  console.log(`Dependency audit passed: ${evaluateAuditReports({ production, full, today })}.`);
}

const entryUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (entryUrl === import.meta.url) main();
