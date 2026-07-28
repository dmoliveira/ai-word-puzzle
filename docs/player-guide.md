# Player guide

## Choose a mode

### Daily crossword

The Daily button opens one canonical puzzle for the current UTC date. Daily streak credit requires all of the following:

- the standard daily puzzle options;
- an attempt started on that puzzle's UTC seed date; and
- completion before that UTC date ends.

A late completion, modified daily link, or replay still appears in local history but does not change the canonical streak. The header shows the current and best locally verified streak.

### Custom crossword

Use Setup to choose topics, challenge, size, style, timer, and learning preferences. A seed reproduces puzzle content; starting or replaying it creates a fresh attempt ID. Crossword answers remain absent from visible and assistive UI until solved or deliberately revealed.

### Trace quest

Quest displays a 14×14 word-search board. Select a target, then solve it in any of these ways:

- tap its start and endpoint;
- drag a straight path from start to endpoint; or
- focus the board, use arrow keys, and press Enter or Space on both endpoints.

Escape clears the current trail. Paused and completed boards remain navigable but read-only.

## Crossword controls

- Choose a clue to open its answer lane.
- Type in the answer lane or directly into a focused grid cell.
- Arrow keys move spatially on the grid.
- Enter or Space switches direction at an intersection without moving focus.
- Escape moves from the answer lane back to the active cell without deleting letters.
- Previous/Next moves between clues; Clear word is the explicit destructive action.

A fully filled incorrect word shows “Not correct yet.” Solved, paused, and completion transitions have visible and screen-reader status.

## Assists and review

Hints, revealed letters, scrambles, word reveals, and a full-puzzle reveal are recorded in a bounded assist ledger. A reveal confirmation is an accessible modal. Word review remains bound to the exact attempt and word that was authorized, so changing clues cannot expose another answer.

## Resume, replay, and share

- Returning to the app resumes only the current unfinished saved attempt.
- History cards always start a fresh replay; they do not resume old partial entries.
- Shared links carry puzzle options and seed, not your entries, score, streak, or history.
- Completion text reports elapsed time and the persisted assist breakdown.

## Local data and privacy

The current attempt and recent progress are stored in `localStorage` for this site's exact origin. There is no account, analytics database, cloud sync, or recovery service.

Clearing site data, using private browsing, changing browsers/devices, or moving to a different domain removes or separates the visible record. A future custom-domain migration also changes the storage origin, so progress from the GitHub Pages URL will not automatically follow.

## Accessibility preferences

- Compact screens use keyboard-operable workspace tabs.
- Crossword and Quest expose named ARIA grids with one roving tab stop.
- Focus is visibly outlined; status updates use one polite live region.
- Reduced-motion preferences minimize animation and smooth scrolling.
- Speech playback depends on browser speech-synthesis support.
