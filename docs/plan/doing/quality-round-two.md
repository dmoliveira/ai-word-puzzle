# Quality round two: mastery and resilience

Status: doing

OC epic: `epic_55`

Branch: `feat/quality-round-two`

Risk: large / high

## Outcome

Deepen Astra Lexa without weakening the deterministic, local-first, answer-safe foundation shipped in PR #45. This round prioritizes correctness and trust: a player explicitly begins play, active work cannot be replaced accidentally, crossings remain consistent, saved data can recover and move safely, daily progress survives bounded history, and new Quest boards are certified rather than merely plausible.

## Scope boundary

Included:

1. frozen generator-v3 identity fixtures and explicit domain/version contracts;
2. date-neutral browser bootstrap with no phantom attempt, timer, or history;
3. atomic run replacement and crossing-safe entry operations;
4. a hidden, deterministic Quest-v4 engine with exact-occurrence certification;
5. strict recoverable storage v3 with pure v2 migration;
6. provenance, a durable daily ledger, honest replay labels, and replace-only backup portability;
7. versioned Quest-v4 activation while preserving v3 runs and links;
8. play-first navigation, accessible setup/status, save warnings, contrast, and mobile Quest orientation;
9. factual assist-derived completion recap and editorial copy; and
10. startup/performance budgets enforced against the built static artifact.

Deferred:

- service-worker/offline caching, which needs a separate staged release after storage v3 has soaked;
- accounts, cloud sync, competitive verification, leaderboards, or multiplayer;
- merge-style backup import or multi-attempt sync;
- adaptive mastery/personalized generation;
- canonical daily migration away from generator v3;
- broad catalog expansion, localization, notifications, or new puzzle families;
- a cosmetic decomposition of every studio component unrelated to the behavior being changed.

No new npm dependency is planned. The exact development-audit exception remains unchanged and expires on 2026-08-29.

## Recorded product and architecture decisions

### Attempt lifecycle

- A prepared puzzle is not an attempt.
- Static HTML and the first client render are an answer-free, date-neutral boot shell.
- Browser bootstrap captures one clock value, parses the URL, reads storage, and resolves precedence before any write.
- Resolution precedence is a valid resumable attempt, then valid shared intent, then the current UTC daily. An invalid link reports a visible warning and does not discard a resumable attempt.
- An attempt starts on explicit play intent: Start/Replay/confirmed replacement, first entry, Quest endpoint selection, or an assist. Navigation, setup changes, and panel opening do not start it.
- A prepared current daily refreshes at UTC rollover before play. A started historical daily continues as a late attempt.
- Migrated v2 attempts remain attempts; the migration never guesses that a zero-progress legacy attempt was a preview.

### Daily truth

- Canonical daily crossword generation remains bit-for-bit generator v3 in this round.
- Content-affecting options define canonical identity; style, timer, learning, and assists remain credit-neutral.
- Credit still requires a canonical attempt started and completed on its seed UTC day, at most once per day.
- Late canonical clears remain canonical archive results but do not earn streak credit.
- The recent-attempt list remains bounded, while a separate deduplicated daily ledger preserves streak and lifetime truth.
- Restored backups preserve valid local daily ledger entries. They are described as locally restored/self-asserted, never server-verified.

### Generator and replay identity

- Storage schema, generator, corpus, backup, and future cache versions are independent axes.
- Generator v3 algorithm, ordered inputs, and representative outputs are frozen before refactoring.
- Missing generator metadata always means legacy v3, never latest.
- Daily and crossword stay on v3. Existing Quest v3 attempts and links continue through frozen compatibility code. Only newly created Quest runs default to v4 after activation.
- New shares carry generator version, corpus revision, and expected puzzle fingerprint. A mismatch fails visibly.
- Exact replay is offered only when regeneration matches the recorded puzzle ID/fingerprint. Otherwise the action is labeled Use settings/current rules.
- Presentation preferences never affect puzzle identity.

### Crossword crossing transaction

- Solved and deliberately revealed letters are immutable.
- Lane entry, direct-cell entry, clear, and reveal use one pure operation layer.
- A conflicting whole-word entry is rejected atomically; it never partially overwrites crossing cells.
- An unsolved, unrevealed crossing is editable and updates both intersecting lanes.
- Solved state is derived from the resulting cells and cannot regress through a neighboring edit.

### Storage v3 and portability

- V3 uses a new primary key and previous-save key; v2 and legacy keys remain byte-for-byte untouched.
- Decode order is valid v3 primary, valid v3 previous save for recovery, pure v2 migration, then legacy migration. Once v3 has been adopted, malformed future/unsupported v3 data enters recovery rather than silently resurrecting stale v2.
- Current attempt and progress decode independently so one malformed branch does not erase the other.
- Every candidate is size-bounded and semantically validated before the commit point.
- Save/import writes previous valid v3 first, writes the candidate once, reads it back, and only then updates React state.
- Persistence returns typed failures; the interface never claims progress is saved after denial, quota, or verification failure.
- Portable backup format is versioned, local, answer-bearing, replace-only, and explicitly warns about privacy. Import is previewed and validated in memory; merge heuristics are deferred. Undo restores the previous valid envelope.

### Quest v4

- V4 owns the complete 14×14 letter grid; React never invents filler.
- Paths use one of eight signed vectors and may overlap only on equal letters.
- Generation uses deterministic ordering, bounded layout/fill nodes, and explicit failure.
- Certification scans every legal straight segment and requires each target to occur exactly once as its intended undirected path.
- Grid and paths participate in the v4 fingerprint and persisted semantic validation.

### Accessibility and status

- One visible event-driven status center announces assists, generation, replacement, save, import, sharing, and fallback outcomes without timer chatter.
- Destructive replacement/import uses a contained dialog with Cancel initially focused and trigger-focus restoration.
- Setup controls expose programmatic grouping and selected state.
- Text contrast is at least 4.5:1; focus/control boundaries are at least 3:1. Reduced motion and forced colors remain explicit contracts.
- Crossword answers remain absent from visible and assistive output until solved or deliberately revealed.

## Task DAG

```text
task_5506  G0 contracts and v3 goldens
├── task_5507  date-neutral explicit bootstrap
│   └── task_5508  transactional transitions and crossings
└── task_5509  hidden certified Quest-v4 engine

task_5508 + task_5509
└── task_5510  strict recoverable storage v3
    └── task_5511  provenance, daily ledger, and portability
        └── task_5512  activate versioned Quest v4
            └── task_5513  play-first accessible experience
                └── task_5514  factual completion recap
                    └── task_5515  performance and artifact budgets
```

Each task is an independently validated commit. Review checkpoints occur after `task_5508`, `task_5510`, `task_5512`, and `task_5515`.

## Non-regression invariants

- Untouched boot creates no attempt ID, timer, history card, daily credit, or future mastery evidence.
- Attempt identity and puzzle identity remain distinct; start/completion timestamps remain immutable.
- Paused, hidden, closed, and offline time remain excluded from elapsed time.
- Canonical daily output never depends on local state or presentation preferences.
- Same generator/corpus/options/seed yields the same puzzle or fails explicitly.
- Every existing embedded attempt remains resumable; failed migration/import never destroys the last valid source.
- Recent-history eviction cannot erase streak truth.
- Backups and progress remain local and are never uploaded.
- Paused/completed grids remain navigable but read-only with one roving tab stop.
- Modal containment/restoration, compact-tab keyboard behavior, Quest keyboard/touch/drag, reduced motion, and forced colors do not regress.
- Save/import/generation failures are visible and announced.

## Validation gates

Per commit:

- `git diff --check`
- `npm run lint`
- `npx tsc --noEmit`
- targeted unit and Chromium tests

Domain gates:

- committed exact v3 daily/custom/Quest golden identities;
- fixed-clock bootstrap and UTC-rollover tests;
- table-driven crossing and replacement failure transactions;
- v2/v3 migration, recovery, semantic mutation, quota, and import atomicity fixtures;
- exhaustive exact-occurrence certification for every returned Quest board plus the 32-seed matrix;
- v3 share/replay compatibility and v4 reload/share/replay coverage;
- keyboard, touch, focus, status, contrast, reduced-motion, and forced-colors checks;
- copy/recap answer-safety and assist-ledger fixtures;
- built-export JavaScript, hydration, generation, and critical gameplay budgets.

Final gates:

- clean install, registry signatures, production audit, and unchanged exact dev exception;
- lint, TypeScript, full unit suite, 32-seed generator matrix, and full Chromium E2E;
- root and `/ai-word-puzzle` builds, export validation, and mounted artifact tests;
- independent verifier plus critical migration/generator/release review;
- required GitHub check, PR-only merge, Pages deployment, semantic smoke, and live Chromium interaction.

## Stop conditions

Split or stop rather than weaken requirements if:

- any v3 golden identity changes;
- a v3 Quest link silently regenerates with v4;
- v2 source data is modified or corrupt v3 can silently fall back to stale data;
- a run replacement can partially commit after failure;
- Quest exact occurrence requires unbounded search or relaxed certification;
- the audit exception must be widened;
- performance work threatens the migration/gameplay milestones; `task_5515` may be deferred rather than weakening earlier slices.
