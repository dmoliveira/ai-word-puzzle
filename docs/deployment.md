# Deployment and operations

## Current production target

- Repository: `dmoliveira/ai-word-puzzle`
- Pages build type: GitHub Actions workflow
- Public URL: `https://dmoliveira.github.io/ai-word-puzzle/`
- Runtime base path: `/ai-word-puzzle`
- Custom domain: none
- HTTPS enforcement: enabled

Repository Settings → Pages must use **GitHub Actions** as its source.

## URL contract

`SITE_URL` is the complete public canonical root. `PAGES_BASE_PATH` is only the browser/runtime path prepended to local assets and routes.

| Deployment | `SITE_URL` | `PAGES_BASE_PATH` |
| --- | --- | --- |
| Current project site | `https://dmoliveira.github.io/ai-word-puzzle/` | `/ai-word-puzzle` |
| Direct custom domain | `https://puzzle.example.com/` | empty |
| Owner-domain inherited project | `https://www.example.com/ai-word-puzzle/` | `/ai-word-puzzle` |

When `SITE_URL` is explicitly supplied, its normalized pathname must exactly equal `PAGES_BASE_PATH`. This prevents a project artifact with broken bare `/_next/` URLs. Local root builds are the only intentional exception: they use `/` at runtime while retaining the production canonical fallback.

## Local export validation

### Root-mounted development artifact

```bash
npm run build
ALLOW_SITE_PATH_MISMATCH=true \
EXPECTED_SITE_URL=https://dmoliveira.github.io/ai-word-puzzle/ \
EXPECTED_BASE_PATH= \
npm run validate:export

ALLOW_SITE_PATH_MISMATCH=true \
EXPECTED_SITE_URL=https://dmoliveira.github.io/ai-word-puzzle/ \
EXPECTED_BASE_PATH= \
npm run test:export
```

### Production Pages-path artifact

```bash
PAGES_BASE_PATH=/ai-word-puzzle \
SITE_URL=https://dmoliveira.github.io/ai-word-puzzle \
npm run build

touch out/.nojekyll

EXPECTED_BASE_PATH=/ai-word-puzzle \
EXPECTED_SITE_URL=https://dmoliveira.github.io/ai-word-puzzle/ \
REQUIRE_NOJEKYLL=true \
npm run validate:export

EXPECTED_BASE_PATH=/ai-word-puzzle \
EXPECTED_SITE_URL=https://dmoliveira.github.io/ai-word-puzzle/ \
npm run test:export
```

Next may switch the generated route import in tracked `next-env.d.ts` between development and build forms. Restore that generated-only diff before committing:

```bash
git restore next-env.d.ts
```

## What the workflow validates

`.github/workflows/deploy-pages.yml`:

1. runs for pull requests to `main`, pushes to `main`, and manual dispatches;
2. checks out the exact commit without persisted credentials and configures Node 22;
3. reads `base_url` and `base_path` from `actions/configure-pages`;
4. independently rejects an inconsistent URL/path pair;
5. installs with `npm ci`, verifies registry signatures, requires zero production dependency findings, and runs lint, TypeScript, unit tests, the 32-seed generator matrix, and Chromium gameplay tests;
6. builds the static export with the Pages URL contract;
7. adds `.nojekyll` and validates HTML, metadata, manifest, images, paths, and local assets;
8. mounts the exact `out/` directory at the Pages base path and checks hydration and asset loading in Chromium;
9. uploads the validated artifact; and
10. only for a `main` push or a `main` manual dispatch, deploys the artifact and runs a retrying smoke against the H1, canonical, manifest, a Next chunk, sitemap, and social PNG.

Build and deploy jobs receive separate least-privilege tokens. Pull requests have an isolated, cancelable concurrency lane and never deploy. Production runs share a non-canceling lane so an older build cannot activate after a newer one. A manual dispatch from a non-`main` ref validates and uploads an artifact but deliberately skips deployment.

The smoke runs after Pages activates the deployment. It detects a bad release; it cannot prevent activation.

### Dependency-audit policy

The deployable artifact contains only `out/`; it does not publish `node_modules` or run a Next server. CI nevertheless requires valid npm registry signatures, a clean production dependency audit, and an allowlist check over the full audit. Next, PostCSS, and Sharp are pinned or overridden to audited patched releases.

As of 2026-07-29, a full development-dependency audit expands one advisory, [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg), into nine high-severity metavulnerability entries through ESLint plugins that still require `minimatch@3` and `brace-expansion@1`. The gate pins the exact affected package and installation-path set so advisory reuse or dependency drift fails closed. There is no patched `brace-expansion@1` release, and forcing version 5 under those CommonJS consumers changes the module API. This is an accepted, time-bounded CI availability risk: the packages are not shipped, production dependencies audit cleanly, pull-request tokens are read-only, and the build job has a 30-minute timeout. The repository maintainer must reassess the exception by 2026-08-29 or sooner when the ESLint plugin graph supports a patched brace-expansion line.

## Search and metadata files

The export includes canonical, Open Graph, Twitter, page-level robots metadata, `manifest.webmanifest`, `sitemap.xml`, icons, and a social image.

At a GitHub project URL, `https://dmoliveira.github.io/ai-word-puzzle/robots.txt` is not the host-root `https://dmoliveira.github.io/robots.txt`, so it has no Robots Exclusion Protocol authority. Page robots metadata remains valid. Submit the project sitemap directly in search-console tooling, or manage host-root robots through the owner site. A direct custom domain makes the project's `/robots.txt` host-root.

## Custom-domain migration

Configure the domain in repository Pages settings; Actions deployments do not use a committed `CNAME`. `configure-pages` will emit the new URL/path contract. Validate a local artifact with those exact values before changing DNS.

A domain migration creates a new browser storage origin. Existing players' GitHub Pages `localStorage` progress will appear absent on the new domain unless a deliberate migration mechanism is shipped first.

## Brand asset generation

Committed PNG/ICO outputs were generated from `app/icon.svg` and `docs/assets/astra-lexa-social.svg` with macOS `sips`:

```bash
sips -s format png app/icon.svg --out /tmp/astra-lexa-icon.png
sips -z 512 512 /tmp/astra-lexa-icon.png --out public/icon-512.png
sips -z 192 192 /tmp/astra-lexa-icon.png --out public/icon-192.png
sips -z 180 180 /tmp/astra-lexa-icon.png --out app/apple-icon.png
sips -z 32 32 /tmp/astra-lexa-icon.png --out /tmp/astra-lexa-favicon.png
sips -s format ico /tmp/astra-lexa-favicon.png --out app/favicon.ico
sips -s format png docs/assets/astra-lexa-social.svg --out public/og-image.png
```

The artifact validator checks file signatures and exact dimensions rather than trusting extensions or generation output.

## Rollback

1. In GitHub Actions, open a known-good successful Pages run and choose **Re-run all jobs**. It rebuilds and deploys that run's commit.
2. Revert the faulty pull request on `main` so the next push does not reintroduce it.
3. Confirm the deployment smoke and manually open the public URL.

Pages/CDN propagation can outlast the smoke retry window. If a retry fails during propagation, inspect the deployed root and `_next` URL before repeating the deployment.

## Troubleshooting

- **Bare `/_next/` paths:** `PAGES_BASE_PATH` was empty or inconsistent during build.
- **Canonical points to host root:** `SITE_URL` was malformed or metadata was resolved relatively.
- **Manifest/icons 404:** inspect the base-prefixed paths in `out/index.html` and `out/manifest.webmanifest`.
- **Nested robots seems ignored:** expected on the project URL; use page metadata and manual sitemap submission.
- **UI loads but does not hydrate:** run `npm run test:export` against the exact Pages-mode artifact and inspect failed same-origin requests.
