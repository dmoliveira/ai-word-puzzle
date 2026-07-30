# Player guide

## Choose a mode

Opening Astra Lexa prepares a puzzle without starting its timer or adding a history card. An attempt begins when you choose **Start puzzle**, enter the first letter, select a Quest endpoint, use an assist, or explicitly start/replay another run. An untouched prepared daily updates at the next UTC date; an attempt that has already started keeps its original seed.

### Daily crossword

The Daily button opens one canonical puzzle for the current UTC date. Daily streak credit requires all of the following:

- the standard daily puzzle options;
- an attempt started on that puzzle's UTC seed date; and
- completion before that UTC date ends.

A late canonical completion remains in the local daily record as **Cleared late** but does not change the streak. A separate compact daily ledger keeps streak truth even after older attempt cards leave the 30-item recent-history list. These records are local and self-asserted, not server verified.

### Custom crossword

Use Setup to choose topics, challenge, size, style, timer, and learning preferences. A seed reproduces puzzle content; starting or replaying it creates a fresh attempt ID. Crossword answers remain absent from visible and assistive UI until solved or deliberately revealed.

Setup choices do not start or save an attempt. Exclusive choices use standard radio controls, topic buttons announce whether they are pressed, and Advanced setup reports whether its controls are expanded.

### Trace quest

Quest displays a 14×14 word-search board. Fresh Quest puzzles use the certified v4 generator: each target has one exact path in any of eight horizontal, vertical, or diagonal directions. If an exact setup cannot be certified within its fixed limits, Astra Lexa reports the failure instead of substituting a v3 board. Select a target, then solve it in any of these ways:

- tap its start and endpoint;
- drag a straight path from start to endpoint; or
- focus the board, use arrow keys, and press Enter or Space on both endpoints.

Escape clears the current trail. Paused and completed boards remain navigable but read-only.
On a compact phone in portrait, Astra Lexa suggests landscape as an optional wider view; rotating never changes the active puzzle or selected trail.

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
- Restart keeps the exact recorded generator and puzzle identity but creates a distinct empty attempt. An unfinished run asks before replacement; an untouched prepared or completed run restarts directly.
- A shared or malformed link never replaces an unfinished saved attempt during page load; the saved attempt resumes with a visible explanation.
- History cards always start a fresh attempt; they do not resume old partial entries. **Replay exact puzzle** appears only when generator, corpus, puzzle ID, and fingerprint still reproduce. Otherwise the honest action is **Use settings/current rules**.
- New shared links carry generator, corpus, seed/options, and an expected puzzle fingerprint. They do not carry your entries, score, streak, or history. Explicit Quest-v4 links regenerate v4; older and unversioned generator-v3 links remain pinned to v3. A fingerprint mismatch fails visibly.
- Completion text reports elapsed time and the persisted assist breakdown.

## Local data and privacy

The current attempt and recent progress are stored in `localStorage` for this site's exact origin. There is no account, analytics database, cloud sync, or recovery service.

The visible event center announces gameplay, sharing, import, and save outcomes without announcing timer ticks. A local-save warning remains visible until a later write is verified. High-contrast and forced-colors modes retain explicit focus, selection, solved, and error boundaries.

Clearing site data, using private browsing, changing browsers/devices, or moving to a different domain removes or separates the visible record. A future custom-domain migration also changes the storage origin, so progress from the GitHub Pages URL will not automatically follow.

### Portable local backup

- **Export local backup** downloads one versioned JSON file. It contains puzzle answers, the current attempt, recent history, and the daily ledger; keep it private.
- Astra Lexa never uploads the file. Import checks its size and full semantic structure in memory, then shows an answer-free preview.
- Import is replace-only: confirmation replaces the current attempt and both progress collections together. It never guesses how to merge records.
- A successful import is described as locally restored/self-asserted. **Undo last import** restores the complete pre-import local save and survives a reload; it expires after a newer gameplay change is saved.
- Cancelled, malformed, future-version, oversized, quota-denied, or stale concurrent imports leave the current local save authoritative.

## Accessibility preferences

- Compact screens use keyboard-operable workspace tabs.
- Crossword and Quest expose named ARIA grids with one roving tab stop.
- Focus is visibly outlined; status updates use one polite live region.
- Reduced-motion preferences minimize animation and smooth scrolling.
- Speech playback depends on browser speech-synthesis support.
