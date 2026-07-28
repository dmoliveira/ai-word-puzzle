import assert from "node:assert/strict";
import test from "node:test";
import { allowedDevelopmentFindings, evaluateAuditReports } from "./audit-dependencies.mjs";

function report(vulnerabilities = {}) {
  const values = Object.values(vulnerabilities);
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: values.length };
  for (const finding of values) counts[finding.severity] += 1;
  return { metadata: { vulnerabilities: counts }, vulnerabilities };
}

const clean = report();
const acceptedDevelopmentFinding = report(
  Object.fromEntries(
    Object.entries(allowedDevelopmentFindings).map(([name, expected], index) => [
      name,
      {
        severity: "high",
        isDirect: expected.direct,
        nodes: expected.nodes,
        via: index === 0 ? [{ url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg" }] : ["brace-expansion"],
      },
    ]),
  ),
);

test("accepts a clean dependency graph", () => {
  assert.match(evaluateAuditReports({ production: clean, full: clean, today: "2099-01-01" }), /audits are clean/);
});

test("rejects every production vulnerability", () => {
  assert.throws(
    () => evaluateAuditReports({ production: acceptedDevelopmentFinding, full: acceptedDevelopmentFinding, today: "2026-07-29" }),
    /Production dependency audit reported/,
  );
});

test("accepts only the time-bounded development advisory", () => {
  assert.match(
    evaluateAuditReports({ production: clean, full: acceptedDevelopmentFinding, today: "2026-07-29" }),
    /accepted development-only GHSA-mh99-v99m-4gvg/,
  );
});

test("rejects an unexpected development advisory", () => {
  const vulnerabilities = structuredClone(acceptedDevelopmentFinding.vulnerabilities);
  vulnerabilities["@eslint/config-array"].via = [{ url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" }];
  assert.throws(
    () => evaluateAuditReports({ production: clean, full: report(vulnerabilities), today: "2026-07-29" }),
    /unapproved advisory source/,
  );
});

test("rejects a new package path under the accepted advisory", () => {
  const vulnerabilities = structuredClone(acceptedDevelopmentFinding.vulnerabilities);
  vulnerabilities["new-dev-package"] = {
    severity: "high",
    isDirect: false,
    nodes: ["node_modules/new-dev-package"],
    via: [{ url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg" }],
  };
  assert.throws(
    () => evaluateAuditReports({ production: clean, full: report(vulnerabilities), today: "2026-07-29" }),
    /finding set changed/,
  );
});

test("rejects a new node path under an accepted package", () => {
  const vulnerabilities = structuredClone(acceptedDevelopmentFinding.vulnerabilities);
  vulnerabilities["brace-expansion"].nodes.push("node_modules/plugin/node_modules/brace-expansion");
  assert.throws(
    () => evaluateAuditReports({ production: clean, full: report(vulnerabilities), today: "2026-07-29" }),
    /finding shape changed for brace-expansion/,
  );
});

test("rejects the accepted advisory after its review deadline", () => {
  assert.throws(
    () => evaluateAuditReports({ production: clean, full: acceptedDevelopmentFinding, today: "2026-08-30" }),
    /exception expired/,
  );
});
