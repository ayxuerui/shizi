## 1. Curriculum: batch composition

**Implemented — this section only.** Sections 2-9 below (the `CharacterTag` record, the parent
tag-review gate, the sync-service `/tags` stream, and the published-batch-plan/review-screen UI)
are **NOT implemented**. They're a separate concern — parent hand-tagging workflow and content
review — from what actually motivated picking this section up: `composeBatch` was the one piece of
this change genuinely needed to drive a real learn → assess → daily-memory play loop for the
learner (see `session/activity-selector.ts` in `apps/assessment`, added outside this change's
original scope to close that loop). Building the full tag-review gate was out of scope for that
goal and would have meaningfully expanded it, so it was deliberately deferred rather than half-built.

- [x] 1.1 Add `batchSize` (default 5) and `batchLookahead` (default 4) to `CurriculumConfig`/`DEFAULT_CURRICULUM_CONFIG` in `packages/curriculum/src/types.ts`
- [x] 1.2 Implement `composeBatch(pool, state, confusabilityIndex, config)` in a new `packages/curriculum/src/batch.ts`, calling `selectNextCharacter` repeatedly and carrying provisional state forward (each pick added to a simulated known-set and appended to `recentlyIntroduced`) — the loop currently inlined at `infra/sync-service/scripts/publish-config.ts:57-72`. NOTE: `publish-config.ts`'s own inlined loop was left as-is, not migrated to call `composeBatch` — see this section's task 6.1 in the (unimplemented) Section 6 for that follow-up work.
- [x] 1.3 Return a short batch rather than violating spacing when no eligible candidate remains, surfacing why (mirroring `SelectionResult`'s `none-eligible` reason discipline)
- [x] 1.4 Implement `composeBatchPlan(...)` returning `batchLookahead` consecutive batches, carrying provisional state across batch boundaries
- [x] 1.5 Export both from `packages/curriculum/src/index.ts`
- [x] 1.6 Tests in `batch.test.ts`: batch filled from Phase A in authored order; batch spanning the Phase A boundary; no two members of one batch confusable with each other; short batch instead of a spacing violation; reconfigured `batchSize` honoured; plan excludes characters placed in earlier batches; determinism across two identical runs — 8 tests, all passing.

## 2. Character data: the tag record

- [ ] 2.1 Add `CharacterTag` (`character`, `concreteness`, `pictographic`, `taggedAt`) to `packages/character-data/src/types.ts`, with a doc comment stating why the key is `(character, taggedAt)` and both attributes travel together
- [ ] 2.2 Implement `validateCharacterTag` in `packages/character-data/src/tag-validation.ts`, following `packages/adaptivity/src/validation.ts` exactly (presence-not-truthiness checks, one validator for all three call sites)
- [ ] 2.3 Implement `latestTagPerCharacter(tags)` resolving to one tag per character by newest `taggedAt`
- [ ] 2.4 Export all three from `packages/character-data/src/index.ts`
- [ ] 2.5 Tests: valid record accepted; each malformed shape rejected with a named error; later record supersedes earlier; out-of-chronological-order input still resolves to the newest; identical record deduplicates

## 3. Backup safety — before anything writes `tags.jsonl`

- [ ] 3.1 Add `data/events/tags.jsonl` to the pathspec exclusion list (`infra/sync-service/scripts/backup-and-push.ts:68-70`) and to the `git add` set (line 115), and include tag counts in the run-log line and the `--quiet` diff check
- [ ] 3.2 Replace the three inline literals with a single named canonical-paths constant used by all three sites, so a future stream cannot be added to one and missed in the others
- [ ] 3.3 Test: with a modified `tags.jsonl` present, `backup-and-push` commits it and does NOT raise `CleanCloneGuardError`; with an unrelated modified file present it still refuses

## 4. Sync service: fourth stream

- [ ] 4.1 Add a `character_tags` table to `infra/sync-service/src/db.ts` — `UNIQUE (character, tagged_at)`, `INSERT OR IGNORE` — plus `insertTag`/`getAllTags` on `EventStore`
- [ ] 4.2 Implement `handleTagsSync` in `infra/sync-service/src/handle-sync.ts`, reusing `validateCharacterTag` rather than a hand-rolled structural guard (the reasoning `handleRatingsSync` already documents)
- [ ] 4.3 Register `"/tags": handleTagsSync` in `infra/sync-service/src/server.ts`'s `ROUTES`
- [ ] 4.4 Export `data/events/tags.jsonl` from `infra/sync-service/scripts/pull-events.ts`, inside the existing `resolveOutDir` guard so `SHIZI_ENV=dev` still refuses the canonical location; include the count in its return value
- [ ] 4.5 Tests: unauthorized rejected; malformed NDJSON rejected; valid batch inserted; re-posting the same records reports duplicates and inserts nothing; dev-store guard still fires with tags present

## 5. Client: local store and outbox

- [ ] 5.1 Add a `tags` object store to `apps/assessment/src/offline/db.ts` keyed `["tag.character", "tag.taggedAt"]`, bump `DB_VERSION` 2 → 3, keeping the `upgrade` callback purely additive and `contains`-guarded
- [ ] 5.2 Add `enqueueTag`/`listPendingTags`/`markTagsSynced` to `apps/assessment/src/offline/event-queue.ts`, validating on write and re-validating on read (the `ratings` discipline)
- [ ] 5.3 Add a fourth block to `flushQueue` in `apps/assessment/src/offline/sync.ts` posting NDJSON to `${config.endpoint}/tags`, and extend `FlushResult` with `tagsCount`
- [ ] 5.4 Tests: round trip through `fake-indexeddb`; invalid record refused on enqueue; a v2-shaped database upgraded to v3 retains its existing events, assignments and ratings; flush failure leaves the tag queue intact and returns without throwing

## 6. Published batch plan

- [ ] 6.1 Replace `publish-config.ts`'s inlined `nextTargets` loop with `composeBatchPlan`, publishing an `upcomingBatches` field; keep `nextTargets` populated (flattened plan) so any existing reader is unaffected
- [ ] 6.2 Fold reviewed tags into the pool `publish-config.ts` publishes, so `probePool` carries corrected values and `tagSource`
- [ ] 6.3 Extend `apps/assessment/src/session/published-config.ts` to read `upcomingBatches`, keeping its fallback-on-any-failure behavior and treating a missing field as an empty plan; update its header comment, which currently states Loop 1 fields are deliberately unread
- [ ] 6.4 Persist current-batch state (the frozen character list plus whether its review is closed) so it survives relaunch, per design's "a batch, once opened, is frozen locally"
- [ ] 6.5 Filter a published batch against the local known-set at the moment it is opened, absorbing plan staleness
- [ ] 6.6 Tests: plan consumed one batch at a time; a republished plan does not alter the frozen open batch; already-known characters dropped when a batch is opened; missing/malformed `upcomingBatches` falls back cleanly

## 7. Fold-back into durable character data

- [ ] 7.1 Write `packages/character-data/scripts/apply-tag-events.mjs`: read `data/events/tags.jsonl`, resolve latest-per-character, write reviewed `concreteness`/`pictographic` columns into `data/tagging-review.csv` (adding the columns if absent), preserving the `_DRAFT` columns and the `notes` column
- [ ] 7.2 Confirm `build-tags.mjs` needs no change by running it after 7.1 and checking exactly the tagged rows flip to `tagSource: "reviewed"` while every untouched row stays `"draft"`
- [ ] 7.3 Test the fold-back on a fixture JSONL, including a character corrected twice (newest wins) and a character absent from the CSV (reported, not silently dropped)

## 8. Parent review screen

- [ ] 8.1 Build `apps/assessment/src/parent/BatchReviewScreen.tsx`: one row per character in the upcoming batch, current concreteness/pictographic values pre-filled, human-reviewed vs generated indicated, reusing `TapTarget` and `diagnostics/theme.ts`
- [ ] 8.2 Show the closing batch's mastery progress from local events via `computeMasteryStates`/`computeKnownSet`, adult-facing only
- [ ] 8.3 Add a single close-and-advance action that works with zero corrections made and with characters still unmastered
- [ ] 8.4 Wire the entry point: unlabeled corner long-press plus a `#review` hash, reusing `createLongPress` and following `diagnostics/entry.ts`'s pattern
- [ ] 8.5 Ensure a session with a pending review still runs on already-introduced characters, with no blocking prompt or empty state on any learner-facing screen
- [ ] 8.6 Tests: closing without changes starts the batch and leaves tags unreviewed; a correction enqueues exactly one `CharacterTag`; correcting twice enqueues two records; advance works with unmastered characters remaining; nothing advances without the adult's action; no labelled affordance reaches the review from a learner-facing screen

## 9. Documentation and spec housekeeping

- [ ] 9.1 Rewrite `data/TAGGING-REVIEW.md` from the batch-spreadsheet workflow to the in-session one, keeping the hand-edit path documented as the fallback and keeping the open 悟/空/姥/木 frequency-rank ask
- [ ] 9.2 Update `data/README.md` to list `events/tags.jsonl` as a canonical export
- [ ] 9.3 Re-point task 3.3 in `openspec/changes/bootstrap-shizi-assessment/tasks.md` at this change instead of the batch review
- [ ] 9.4 Hand-edit `openspec/specs/curriculum/spec.md`'s Purpose, which says "which character a learner should encounter next" — singular, and a delta cannot change a Purpose
- [ ] 9.5 Document the `/tags` route in `infra/README.md` alongside the existing three
- [ ] 9.6 Run `npm test`, `openspec validate --strict`, and a dev-stack round trip (POST `/tags`, rows land in `character_tags`, `pull-events.ts` still refuses the canonical path under `SHIZI_ENV=dev`)
