## 0. Preconditions

- [ ] 0.1 Confirm `add-tiered-content-progression` has landed — this change builds on its kind-qualified unit reference, per-tier mastery, and 词 pool, and must not define its own
- [ ] 0.2 Confirm `bootstrap-shizi-assessment` and `add-tracing-modality-arm` are not concurrently editing `learner-state` / `assessment-engine` types; whichever lands second rebases
- [ ] 0.3 Take a verified backup of the sync-service SQLite store and `data/events/events.jsonl` before any schema work (no events are modified by this change, but the rebuild path touches the store)

## 1. Review-scheduling package

- [ ] 1.1 Create `packages/review-scheduling` (`@shizi/review-scheduling`) following the existing package layout, depending on `content-model` and `learner-state` only
- [ ] 1.2 Define `ReviewSchedulingConfig` as per-tier parameters — `initialHalfLifeDays`, `growthFactor`, `lapseFactor`, `minHalfLifeDays`, `maxHalfLifeDays`, `fastResponseThresholdMs`, `targetRetention` — with the design.md defaults, and a `DEFAULT_REVIEW_SCHEDULING_CONFIG` export mirroring `DEFAULT_MASTERY_CONFIG`'s shape
- [ ] 1.3 Source `fastResponseThresholdMs` from the same per-tier guess-detection threshold `learner-state` and `assessment-engine` already use, rather than declaring a second independent value
- [ ] 1.4 Implement `predictedRetention(progress, now)` as `2^(−elapsedDays / halfLifeDays)`, taking `now` as a parameter and never reading the clock
- [ ] 1.5 Implement the interval update fold: first exposure sets the initial half-life; fast-correct multiplies by `growthFactor`; slow-correct leaves it unchanged; incorrect multiplies by `lapseFactor`; all clamped to `[minHalfLifeDays, maxHalfLifeDays]`
- [ ] 1.6 Implement `computeUnitProgress(events, config)` — events folded in timestamp order into a per-unit record of mastery state, exposure count, correct count, `lastSeenAt`, `halfLifeDays`, and `dueAt`, keyed by kind-qualified unit
- [ ] 1.7 Implement `isDue(progress, now, config)` and `buildReviewQueue(progressMap, now, config)`, ordered by ascending predicted retention with a `(kind, unitId)` tie-break so the ordering is total
- [ ] 1.8 Export a `PROJECTION_VERSION` constant that any change to the fold or its defaults must bump
- [ ] 1.9 Unit-test the curve: monotonic decay while unseen; a unit becoming due purely through elapsed time; interval lengthens on fast-correct, collapses on incorrect, is unchanged on slow-correct; clamping holds under long runs of either outcome
- [ ] 1.10 Unit-test that a never-exposed unit has no retention estimate and never enters the queue
- [ ] 1.11 Unit-test per-tier independence: changing the word tier's `targetRetention` or threshold does not alter character-tier due decisions, including the same-latency-different-tier case
- [ ] 1.12 Unit-test queue reproducibility (same events + config + `now` ⇒ identical order) and cross-tier ordering by risk rather than by tier

## 2. Learner-state progress record

- [ ] 2.1 Define the `UnitProgress` record type in `learner-state` (or re-export it from `review-scheduling` if the dependency direction reads more cleanly), including the `projectionVersion` stamp
- [ ] 2.2 Document in the type that the record is projection output only — no editing interface exists, and it is never an input to the next projection
- [ ] 2.3 Test that a full replay of the event log reproduces every progress record exactly, so a wiped projection loses nothing
- [ ] 2.4 Test that re-appending an already-seen event id leaves every progress record unchanged (no double-counted exposure, no twice-advanced interval)

## 3. Sync-service materialization

- [ ] 3.1 Add the `unit_progress` table to `infra/sync-service/src/db.ts` — primary key `(kind, unit_id)`, the `UnitProgress` fields, and `projection_version` — created via `CREATE TABLE IF NOT EXISTS` alongside the existing schema
- [ ] 3.2 Extend `EventStore` with progress read/write/replace operations, keeping the existing insert idempotency semantics untouched
- [ ] 3.3 Update progress in `handle-sync.ts` inside the same transaction as the event insert, and only for events that actually inserted, by re-folding the affected unit's events rather than patching the row
- [ ] 3.4 Report stale progress (stamped version ≠ current `PROJECTION_VERSION`) as stale rather than serving it as current
- [ ] 3.5 Add `infra/sync-service/scripts/rebuild-progress.ts` alongside `pull-events.ts` — re-folds the whole log and replaces the table in one transaction, reusing the existing default host DB-path resolution and the dev/prod guard conventions
- [ ] 3.6 Test that incremental per-event updates produce byte-identical rows to a full rebuild over the same log
- [ ] 3.7 Test that a duplicate event POST changes no progress row, and that a batch containing both new and duplicate events updates only the new ones
- [ ] 3.8 Test that dropping the `unit_progress` table and rebuilding restores every row
- [ ] 3.9 Confirm `pull-events.ts` and its output are unchanged — export stays events-only — with a test asserting no progress row appears in the JSONL

## 4. Client materialization

- [ ] 4.1 Add a `progress` object store to `apps/assessment/src/offline/db.ts`, keyed by kind-qualified unit, following the existing natural-key store pattern
- [ ] 4.2 Recompute progress from `loadPriorEvents()` at bout start and rewrite the store at bout end, discarding any store content whose `projectionVersion` is stale
- [ ] 4.3 Verify the due queue is available and correct with no network connection, per the assessment spec's full-offline requirement
- [ ] 4.4 Test that the client-side fold and the server-side fold produce the same progress for the same event set (same function, asserted end to end)

## 5. Review inside assessment bouts

- [ ] 5.1 Extend `pickEasyItem` in `packages/assessment-engine/src/dilution.ts` to take the review queue and a `reviewShareOfEasySlots` cap (default 0.5), serving due units in queue order and falling back to the existing identity/known rotation
- [ ] 5.2 Leave `isInformativeSlot` and all frontier/distractor/calibration logic untouched
- [ ] 5.3 Thread the review queue into `AssessmentSession` as an input derived from `priorEvents` and the injected `now`, keeping the session deterministic given the same inputs
- [ ] 5.4 Test that due units fill easy slots most-at-risk-first, that a bout with nothing due behaves exactly as before this change, and that a backlog larger than the cap leaves the remaining easy slots to identity/known items
- [ ] 5.5 Test that informative slots are unaffected by the presence of a review queue
- [ ] 5.6 Confirm nothing in the app renders a due count, overdue marker, streak, retention score, or deadline cue, and that a review item is presented identically to the same item outside review

## 6. Docs and verification

- [ ] 6.1 Document `rebuild-progress.ts` in `infra/README.md` alongside the existing script descriptions, including when a version bump requires running it
- [ ] 6.2 Run `npm test`, `npm run typecheck`, and `npm run lint` across the workspace
- [ ] 6.3 Backfill: run `rebuild-progress.ts` once against the live store and spot-check a handful of units' `dueAt` against hand-computed values
- [ ] 6.4 Simulate a two-week gap by supplying a future `now` to the projection, and confirm the resulting queue is ordered by risk and bounded by the share cap in a generated bout
- [ ] 6.5 Run one real bout with Eliana after the wiring lands; observe whether the review load feels right and whether the felt success rate holds
- [ ] 6.6 Record observed intervals and revisit design.md's open question on the 词-tier `growthFactor`
