# Astra Lexa

[Play Astra Lexa](https://dmoliveira.github.io/ai-word-puzzle/) — an accessible, local-first daily crossword and word-quest studio built with Next.js.

## What ships

- One canonical UTC daily crossword plus configurable seeded custom runs
- Editorial crossword clues with connected exact-size boards
- A 14×14 trace quest with keyboard, touch-endpoint, and pointer-drag controls
- Challenge, topic, content-pack, board-style, timer, and learning options
- Bounded hints, letter/word/puzzle reveals, review gates, and truthful assist summaries
- Browser-local current-attempt persistence, daily streaks, archive, and replay history
- Answer-safe crossword rendering before solve or deliberate review
- Responsive ARIA grids, compact workspace tabs, visible focus, live status, and reduced-motion support
- Deterministic generator, unit, matrix, browser, static-export, and artifact validation
- GitHub Pages deployment at the repository project path

The app has no account or backend. Progress stays in this browser and is not a remote leaderboard or cloud backup.

## Requirements

- Node.js 22 or newer
- npm 10 or 11
- Chromium installed through Playwright for browser checks

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000/`.

## Validation

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run test:generator
npx playwright install chromium
npm run test:e2e -- --project=chromium
npm run build
npm run validate:export
npm run validate:artifacts
npm run test:export
```

`npm run build` always creates a static export in `out/`. The export validator checks SEO files, canonical and social metadata, image dimensions, manifest paths, local asset resolution, and Next chunk URLs. The artifact-budget validator caps HTML and compressed JavaScript delivery. The export browser test mounts the artifact and proves that it hydrates without failed same-origin requests.

## Project map

- `app/`: server metadata, stable indexable page copy, and interactive UI
- `app/components/word-puzzle-studio.tsx`: crossword/quest play, review, archive, and controls
- `lib/puzzle-generator.ts`, `lib/board-generator.ts`: deterministic puzzle selection and board construction
- `lib/clue-catalog.ts`, `lib/word-bank.ts`: editorial crossword and broad quest content
- `lib/run-state.ts`, `lib/progress.ts`, `lib/session-storage.ts`: lifecycle and local persistence
- `lib/site-config.ts`: validated canonical URL and Pages base-path contract
- `scripts/`: export validation, mounted serving, and deployment smoke checks
- `tests/e2e/`, `tests/export/`: live UI and built-artifact browser coverage
- `.github/workflows/deploy-pages.yml`: validated GitHub Pages build and deployment

## Documentation

- [Player guide](docs/player-guide.md)
- [Deployment and operations](docs/deployment.md)
- [Documentation index](docs/index.md)

## Deployment summary

Production uses GitHub Pages Actions at `https://dmoliveira.github.io/ai-word-puzzle/`. `actions/configure-pages` supplies the full `SITE_URL` and runtime `PAGES_BASE_PATH`; the build rejects inconsistent values. See [the deployment guide](docs/deployment.md) for local Pages-mode validation, custom domains, robots limitations, smoke checks, and rollback.

## Safe extension points

- Add reviewed clues through `lib/clue-catalog.ts` and broad trace content through `lib/word-bank.ts`.
- Add themes without changing persisted puzzle identity.
- Extend lifecycle or progress data through strict decoders and migration tests.
- Treat accounts, synced progress, multiplayer, and leaderboards as new backend features rather than implying they already exist.
