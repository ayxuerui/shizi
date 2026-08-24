## 1. Progression layer: the learner context projection

- [x] 1.1 Define `LearnerContext` in `packages/learner-state/src/learner-context.ts`: mastery state per unit, known set, set of units ever presented, last-exposure timestamp per unit, and first-introduction ordering (oldest first)
- [x] 1.2 Implement `deriveLearnerContext(events, config)` as a pure projection over the event log, computing "ever presented" from all events and mastery from recognition-modality events only (design decision 3 — these are different event subsets and must not be conflated)
- [x] 1.3 Export the type and function from `packages/learner-state/src/index.ts`
- [x] 1.4 Tests in `learner-context.test.ts`: an introduction-only unit reports as presented with no mastery state; a unit with two fast-correct recognition events reports mastered; introduction order follows first-ever exposure across all modalities; last-exposure follows the most recent event of any modality; two calls against the same log return identical facts; an empty log yields an empty context
- [x] 1.5 Confirm no existing `learner-state` test changed and the whole package suite still passes

## 2. Curriculum layer: context-driven batch contract

- [ ] 2.1 Add a `LearningGoal` type (`{ kind, id }`) in `packages/curriculum`, shaped to be adoptable by `add-tiered-content-progression`'s planned `ContentRef` (design decision 7)
- [ ] 2.2 Add a batch-request entry point accepting a `LearnerContext` (rather than the current hand-assembled `CurriculumState`) and returning a batch of `LearningGoal`s, delegating to the existing `composeBatch` — no new selection logic
- [ ] 2.3 Add the plan-shaped entry point over `composeBatchPlan`, returning consecutive batches with no goal repeated across batches
- [ ] 2.4 Export both from `packages/curriculum/src/index.ts`, keeping `selectNextCharacter`/`composeBatch` exported for existing callers
- [ ] 2.5 Tests: a batch derived from a `LearnerContext` matches the equivalent `composeBatch` call; each goal carries its kind; a short batch is returned rather than a spacing violation; batch composition is reproducible across two identical calls
- [ ] 2.6 Confirm every existing `curriculum` test passes unmodified

## 3. Review activity: extract to its own package

- [ ] 3.1 Scaffold `packages/memory-review-engine` mirroring `packages/exposure-engine`'s shape (manifest, tsconfig with references, vitest config), and register it in the root `tsconfig.json`
- [ ] 3.2 Move `MemorySession` from `apps/assessment/src/session/memory-session.ts` into the new package, behavior unchanged
- [ ] 3.3 Change the bout to accept a supplied due queue rather than computing due-ness: it takes units from the front of the queue up to the configured bound, preserves the queue's order, and applies no recency or interval rule of its own (design decision 4a — `review-scheduling` owns due-ness)
- [ ] 3.4 Port the app's existing `computeDueForMemory` recency rule into a clearly-labelled **placeholder** queue provider, reading a `LearnerContext`, to stand in until `review-scheduling` is implemented — named and documented so it cannot be mistaken for the real retention model
- [ ] 3.5 Move `apps/assessment/src/session/memory-session.test.ts` into the package and extend it: an empty queue yields no bout; a queue longer than the bound leaves the remainder untouched; queue order is preserved and never re-sorted; a review response is recorded as recognition evidence
- [ ] 3.6 Confirm nothing in this package labels a bout as review to the learner, and that an individual review item's presentation is identical to the same item outside review
- [ ] 3.7 Update the app's imports to the new package and delete the app-local copies

## 4. Learning layer: the orchestration package

- [ ] 4.1 Scaffold `packages/learning-orchestration` (manifest, tsconfig with references to curriculum/learner-state/memory-review-engine, vitest config), and register it in the root `tsconfig.json`
- [ ] 4.2 Define the decision type: an activity kind (`introduce` | `measure` | `review`) plus the inputs that activity needs, and a terminal "nothing remains" state
- [ ] 4.3 Implement `nextActivity(context, plan, orchestrationState, config)` as a pure function, porting the decision logic from `apps/assessment/src/session/activity-selector.ts` — reading the learner context rather than re-deriving mastery, recency, or introduction order
- [ ] 4.4 Implement the batch-open rule: filter the next published batch against the current learner context, then freeze the resulting concrete goal list into orchestration state; identify batches by content, never by index (design decision 5)
- [ ] 4.5 Implement the published-plan fallback: when no plan is available, compose a batch locally via the curriculum layer so an activity is still produced
- [ ] 4.6 Implement `reportActivityOutcome`, advancing orchestration state (frozen-batch progress, review-completed-today) without writing events itself (design decision 2)
- [ ] 4.7 Implement the review-precedence and daily-cadence rules: a due review preempts new-goal work, and at most one review bout per local calendar day, with the current date injected rather than read from the clock
- [ ] 4.8 Export the public surface from `packages/learning-orchestration/src/index.ts`
- [ ] 4.9 Tests covering each `learning-orchestration` spec scenario: introduction precedes measurement; a presented-but-unmastered goal is not re-introduced; a fully-mastered batch advances; selection is reproducible; an absent plan still yields an activity; an already-mastered published goal is filtered out; a republished plan does not alter a frozen open batch; the terminal state is reached rather than an empty activity
- [ ] 4.10 Tests covering each `memory-review` scheduling scenario at the orchestration level: a due unit preempts new-goal work; no second review the same day; a new day makes review available again

## 5. Client persistence for orchestration state

- [ ] 5.1 Add an orchestration-state object store to `apps/assessment/src/offline/db.ts` and bump `DB_VERSION`, keeping the `upgrade` callback purely additive and `contains`-guarded (design decision 6 — a destructive upgrade is a data-loss path per `deployment`'s client-retention backstop)
- [ ] 5.2 Add read/write helpers for the frozen current batch and the last-review date, validating on read as the existing stores do
- [ ] 5.3 Migrate the last-review date off `localStorage`, reading any existing `localStorage` value once as a seed so a device mid-cycle does not get a second review bout the same day
- [ ] 5.4 Tests: round trip through `fake-indexeddb`; a prior-version database upgraded retains its existing events, assignments, and ratings; a `localStorage`-seeded last-review date is honored once and then read from IndexedDB

## 6. Wire the app to the learning layer

- [ ] 6.1 Reduce `apps/assessment/src/session/PracticeRouter.tsx` to: load the learner context and published plan, ask the learning layer for a decision, render the matching activity screen, and call `reportActivityOutcome` on completion
- [ ] 6.2 Delete `apps/assessment/src/session/activity-selector.ts` and its test, confirming no remaining app file imports `composeBatch`, `computeMasteryStates`, or `computeKnownSet` directly
- [ ] 6.3 Render the terminal "nothing remains" state as a positive closing beat, with no digits and no score-like text
- [ ] 6.4 Confirm the activity screens themselves (`BoutScreen`, `ExposureScreen`, `MemoryScreen`) are unchanged apart from import paths
- [ ] 6.5 Component test at the router level: completing one activity leads to a further activity with no remount of the app, and the terminal state appears only when nothing remains

## 7. Publish the pre-generated plan

- [ ] 7.1 Replace `infra/sync-service/scripts/publish-config.ts`'s inlined greedy look-ahead loop with the curriculum layer's plan entry point, emitting an `upcomingBatches` field
- [ ] 7.2 Remove the `nextTargets` field (verified unread — design decision 5)
- [ ] 7.3 Extend `apps/assessment/src/session/published-config.ts` to read `upcomingBatches`, treating a missing or malformed field as an empty plan and keeping its existing fallback-on-any-failure behavior; update its header comment, which currently states the Loop 1 fields are deliberately unread
- [ ] 7.4 Tests: a published plan round-trips into a usable plan; a missing `upcomingBatches` yields an empty plan without throwing; a malformed field falls back cleanly
- [ ] 7.5 Run the publishing script against a real event history and confirm the emitted plan's batches match what the curriculum layer composes for the same input

## 8. Documentation and spec housekeeping

- [ ] 8.1 Hand-edit `openspec/specs/curriculum/spec.md`'s Purpose to cover batches of learning goals rather than "which character a learner should encounter next" (a delta cannot change a Purpose)
- [ ] 8.2 Re-point `openspec/changes/add-batched-curriculum-tagging/tasks.md` Section 6 at this change, so both changes do not edit `publish-config.ts`; leave its parent tag-review sections untouched
- [ ] 8.3 Document the three layers and their contracts where a contributor will find it — which layer owns which decision, and the rule that no layer reaches past its neighbour
- [ ] 8.4 Note in `openspec/changes/add-tiered-content-progression`'s design or tasks that `LearningGoal` and `ContentRef` must converge on one definition of unit identity, whichever change lands second
- [ ] 8.5 Amend `openspec/changes/add-memory-curve-review`: replace its "Make review active inside existing bouts / no new activity, no new screen" bullet and its `assessment` dilution-slot delta with consuming this change's review activity, leaving its `review-scheduling` capability and its `learner-state` delta intact (design decision 4a)
- [ ] 8.6 Confirm the amended `add-memory-curve-review` and this change contain exactly one definition of due-ness between them — no recency or interval rule outside `review-scheduling`

## 9. Whole-workspace verification

- [ ] 9.1 Run the full workspace build, typecheck, lint, and test; confirm every pre-existing test passes unmodified, including `BoutScreen.test.tsx`'s no-score-like-text assertions and `learner-state`'s mastery-projection tests
- [ ] 9.2 Confirm the layering holds structurally: nothing in `apps/assessment` makes an activity decision, and no activity engine imports the learning layer
- [ ] 9.3 Re-verify the full learn → assess → review walkthrough on the dev deployment (`shizi-dev.realxco.com`), including both exposure arms and a review bout triggered by a genuinely stale mastered unit — the loop must be behaviorally identical to before the relocation
- [ ] 9.4 Confirm a full offline pass: with the network disabled, activity selection, delivery, and outcome reporting all still work from local state
- [ ] 9.5 Run `openspec validate --all --strict`
