# Astra Lexa

Configurable English word-puzzle studio built with Next.js.

## Current Scope

- Topic-based puzzle generation with weighted selection
- Deterministic seeded runs for custom and daily play
- Three challenge levels: `breeze`, `quest`, `mythic`
- 2500+ themed, bridge, and generated compound words
- Visual clue chips plus incremental hint ladder
- Pause, resume, restart, current-word review, and full-puzzle review
- Switchable presentation themes including Greek-letter flavored styling
- Server puzzle route at `/api/puzzle`
- Local persistence so the current run survives reloads
- Pure TypeScript generator separated from the UI for easy extension

## Project Structure

- `app/`: Next.js UI
- `lib/word-bank.ts`: topic packs and lexicon seed data
- `lib/puzzle-generator.ts`: weighted puzzle selection and hint generation
- `app/api/puzzle/route.ts`: server-side puzzle generation endpoint
- `lib/themes.ts`: visual theme tokens
- `lib/game-types.ts`: shared contracts

## Quick Start

1. `npm install`
2. `npm run dev`
3. `npm run test`
4. `npm run build`

## Extension Points

- Add more topics by appending `TopicPack` entries in `lib/word-bank.ts`
- Swap the seeded word lists for a larger JSON or database-backed lexicon
- Add more theme shells or clue presentation formats without changing the generator contract
- Add leaderboard, streaks, multiplayer drafts, or curated puzzle campaigns without rewriting the generator
