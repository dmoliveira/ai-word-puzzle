# Astra Lexa

Configurable English word-puzzle studio built with Next.js.

## Current Scope

- Crossword-style placed boards with clue numbers and overlaps
- Topic-based puzzle generation with weighted selection and seed control
- Deterministic seeded runs for custom and daily play
- Three challenge levels: `breeze`, `quest`, `mythic`
- 3000+ themed, bridge, generated, and curated English words
- Frequency-aware scoring using `common`, `uncommon`, and `rare` bands
- Visual clue chips, clue-art panels, and incremental hint ladders
- Pause, resume, restart, current-word review, and full-puzzle review
- Daily streaks, recent-run history, and local daily archive view
- Switchable presentation themes including Greek-letter flavored styling
- Server puzzle route at `/api/puzzle`
- Local persistence so the current run survives reloads
- Pure TypeScript generator separated from the UI for easy extension
- Playwright coverage for the main play flow

## Project Structure

- `app/`: Next.js UI
- `app/components/word-puzzle-studio.tsx`: board play UI, archive, and run controls
- `app/api/puzzle/route.ts`: server-side puzzle generation endpoint
- `lib/word-bank.ts`: topic packs and lexicon seed data
- `lib/lexicon-seeds.ts`: curated English lexicon inputs
- `lib/puzzle-generator.ts`: weighted puzzle selection, seeded generation, and board placement
- `lib/progress.ts`: streak and archive persistence helpers
- `lib/themes.ts`: visual theme tokens
- `lib/game-types.ts`: shared contracts
- `tests/e2e/`: Playwright browser coverage

## Quick Start

1. `npm install`
2. `npm run dev`
3. `npm run test`
4. `npm run build`
5. `npm run test:e2e`

## Extension Points

- Add more topics by appending `TopicPack` entries in `lib/word-bank.ts`
- Swap the seeded word lists for a larger JSON or database-backed lexicon
- Add more theme shells, visual clue packs, or clue presentation formats without changing the generator contract
- Add leaderboard, streaks, multiplayer drafts, or curated puzzle campaigns without rewriting the generator
