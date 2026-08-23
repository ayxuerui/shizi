## 0. Preconditions

- [ ] 0.1 Confirm `bootstrap-shizi-assessment` remaining tasks have landed — this change rewrites types that change is still building against
- [ ] 0.2 Agree sequencing with `add-tracing-modality-arm`, which also modifies the `learner-state` event schema; whichever lands second rebases rather than editing concurrently
- [ ] 0.3 Confirm no assessment session is in progress and take a verified backup of `data/events/events.jsonl` and the sync-service SQLite store

## 1. Content model foundation

- [ ] 1.1 Create `packages/content-model` with `Tier`, `ContentRef`, and the `character → word → sentence` tier ordering
- [ ] 1.2 Define the `TierMeasures` interface (difficulty function + confusability relation) that each tier supplies
- [ ] 1.3 Implement the eligibility predicate: a unit is eligible when every component is in the known set one tier below, and it can report which components are missing
- [ ] 1.4 Implement component decomposition contracts (word → characters, sentence → words)
- [ ] 1.5 Unit-test eligibility and decomposition, including the same-text-at-two-tiers distinctness case
- [ ] 1.6 Migrate `packages/character-data` onto `ContentRef` as the `character`-tier implementation — types only, no behavior change
- [ ] 1.7 Verify the existing test suite passes unchanged after 1.6

## 2. CC-CEDICT licensing

- [ ] 2.1 Create `data/ATTRIBUTIONS.md` discharging CC-CEDICT attribution and CC BY-SA 3.0 share-alike obligations
- [ ] 2.2 Update `data/PROVENANCE.md` to clear the outstanding attribution action item and record CC-CEDICT as integrated
- [ ] 2.3 Confirm the derived-subset redistribution approach is consistent with the licence before deriving any data

## 3. Word tier data

- [ ] 3.1 Add the CC-CEDICT source ingest, filtering to words composed solely of candidate-pool characters
- [ ] 3.2 Create `packages/word-data` with per-word attributes: component characters in order, gloss, pinyin, frequency
- [ ] 3.3 Implement the word usability gate (missing required attribute excludes the word), mirroring `character-data`'s `exclusion.ts` pattern
- [ ] 3.4 Commit the derived word pool as vendored data with provenance
- [ ] 3.5 Human age-appropriateness review pass; record exclusions with reasons as data, separate from the mechanical filter
- [ ] 3.6 Rewrite adult-oriented CC-CEDICT glosses into child-appropriate wording during review
- [ ] 3.7 Implement word-tier confusability (shared component character in the same position, near-identical pinyin) — explicitly not a stroke-shape lookup
- [ ] 3.8 Implement word-tier difficulty (component count, max component-character difficulty, word frequency)
- [ ] 3.9 Add the character→word participation query to `character-data`, derived from the word pool
- [ ] 3.10 **Measure and report** how many words are composable from the 203-character pool, and how many become eligible at realistic known-set sizes — if near zero, stop and widen the character pool before continuing

## 4. Event schema migration

- [ ] 4.1 Change `LearnerEvent.character: string` to `unit: ContentRef` in `packages/learner-state`
- [ ] 4.2 Make `priorExposureCount` and `daysSinceLastExposure` per-unit rather than per-character
- [ ] 4.3 Write the idempotent re-encode migration for `data/events/events.jsonl`, mapping each event to `{kind: "character", id: <old character>}` and preserving event ids
- [ ] 4.4 Migrate the sync-service SQLite event store schema in step
- [ ] 4.5 Assert post-migration that event count and the full set of event ids are identical to the backup; fail loudly otherwise
- [ ] 4.6 Reject events submitted without a kind rather than defaulting to the character tier
- [ ] 4.7 Run the migration against the real event log and verify projections replay to the same character mastery states as before

## 5. Per-tier learner state

- [ ] 5.1 Key `computeMasteryStates()` on `ContentRef` so tiers cannot collide in one namespace
- [ ] 5.2 Make `computeKnownSet()` queryable per tier, returning only units of the requested tier
- [ ] 5.3 Move guess-detection and slow-response latency thresholds into per-tier config
- [ ] 5.4 Test that word mastery does not infer character mastery or vice versa
- [ ] 5.5 Test that demotion of a component makes dependent units ineligible while preserving their event history

## 6. Tier-aware curriculum

- [ ] 6.1 Generalize `CurriculumState.knownSet` and `SelectionResult` to carry `ContentRef` and report the selected unit's tier
- [ ] 6.2 Make selection consider all eligible tiers in one pass instead of exhausting the character tier first
- [ ] 6.3 Replace `wordUnlockScore()`'s constant `0` with a real score from the character→word participation data
- [ ] 6.4 Replace `storyUnlockScore()`'s constant `0` with a sentence-pool-backed score (returns 0 legitimately until section 7 lands)
- [ ] 6.5 Scope confusability spacing to within-tier, using each tier's own measure
- [ ] 6.6 Implement the consolidation gate: a configured minimum of eligible units before a tier is drawn from
- [ ] 6.7 Make tier-emphasis weights configurable alongside the existing `ScoringWeights`
- [ ] 6.8 Test reproducibility of tier-aware selection against fixed learner state and weights

## 7. Content validator extensions

- [ ] 7.1 Require an explicit target tier on every validation request; reject requests that omit it
- [ ] 7.2 Add word-level whitelist enforcement (word must be in the known word set or declared new word targets)
- [ ] 7.3 Implement maximum-matching segmentation against the word pool, reporting a hard failure for any uncoverable span
- [ ] 7.4 Keep character-level whitelist checks applying at every tier, in addition to word-level checks
- [ ] 7.5 Test that a sentence with permitted characters but an undeclared word is a hard failure

## 8. Sentence generation pipeline

- [ ] 8.1 Add `@anthropic-ai/sdk` as a devDependency; confirm it is not reachable from the `apps/assessment` bundle
- [ ] 8.2 Create the generation script under `infra/` (not `apps/`) so it cannot be bundled into the PWA
- [ ] 8.3 Implement batch generation via `client.messages.batches.create` with `claude-opus-5`, adaptive thinking, and results keyed by `custom_id`
- [ ] 8.4 Use structured outputs so each candidate returns its text plus its declared component word list
- [ ] 8.5 Verify each declared component list against the word pool by maximum matching; reject on mismatch
- [ ] 8.6 Enforce the configured maximum word count and reject near-duplicates of sentences already in the bank
- [ ] 8.7 Run every candidate through `@shizi/validator`; discard hard failures automatically and log the rejection rate
- [ ] 8.8 Emit survivors to a human review file; admit only explicitly approved sentences to the bank
- [ ] 8.9 Create `packages/sentence-data` with per-sentence attributes, component words, approval state, and provenance (model id, run, learner-state assumption)
- [ ] 8.10 Generate, review, and commit the first sentence bank
- [ ] 8.11 Verify the app builds and runs with no network access and no model credentials present

## 9. Assessment across tiers

- [ ] 9.1 Generalize `AssessmentSession` and `RecordResponseInput` from `character: string` to `ContentRef`
- [ ] 9.2 Maintain a separate frontier per tier, each positioned against its own difficulty measure
- [ ] 9.3 Restrict probing to units the learner is currently eligible for at that tier
- [ ] 9.4 Draw distractors from the probed unit's own tier, comparable in length to the probe
- [ ] 9.5 Decline to probe a unit when too few same-tier distractors exist, rather than borrowing from another tier
- [ ] 9.6 Include `shaky`-state units of any tier as probe candidates alongside frontier candidates
- [ ] 9.7 Test that a word probe never receives a single-character distractor

## 10. App presentation

- [ ] 10.1 Present multi-character units (word and sentence probes) with tier-appropriate layout and sizing on iPad
- [ ] 10.2 Extend narration to speak words and sentences, verifying zh-CN voice availability via the existing diagnostics surface
- [ ] 10.3 Keep the no-visible-scoring and narrative-framing guarantees intact at the new tiers
- [ ] 10.4 Verify full offline operation with the sentence bank loaded from committed data

## 11. Verification

- [ ] 11.1 Run the full test suite and typecheck across all packages
- [ ] 11.2 Replay the migrated event log end to end and confirm character-tier mastery states match pre-migration output
- [ ] 11.3 Walk a simulated learner from zero known characters up through a first eligible word and a first eligible sentence, asserting the ladder gates correctly at each step
- [ ] 11.4 Confirm no unapproved generated sentence is reachable by the app
- [ ] 11.5 Run one real bout with Eliana at the word tier; observe whether multi-character probes hold engagement and whether the no-failure framing survives
- [ ] 11.6 Record calibrated per-tier latency thresholds and the consolidation minimum from observed sessions, resolving design.md's open questions
