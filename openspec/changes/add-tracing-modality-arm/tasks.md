## 1. De-risk the `hanzi-writer` integration

- [ ] 1.1 Spike: point `hanzi-writer`'s `charDataLoader` at `character-data`'s existing `stroke-data.ts`
  for a handful of pool characters (including at least one identity-set character) and confirm it
  renders and drives `quiz()` correctly from raw Make Me a Hanzi coordinates, without needing
  `hanzi-writer-data` — per design.md's "residual risk." Record the result (pass, or what adjustment was
  needed) before starting Section 3.
- [ ] 1.2 If 1.1 fails outright, stop and revisit design.md's `hanzi-writer`/`character-data` decision
  before proceeding (fallback: vendor `hanzi-writer-data` for the needed characters, reopening the
  license-notice work design.md currently treats as unnecessary).

## 2. `adaptivity` package changes

- [ ] 2.1 Widen `assignPairToArms`'s behavior (or its call sites' config) so a configured arm set of
  fewer than two arms is treated as a misconfiguration for randomization purposes, per the
  adaptivity-instrumentation spec's modified "Matched-pair randomization protocol" requirement.
- [ ] 2.2 Add a lookup helper for finding an existing `ArmAssignment` for a given character across a
  supplied assignment history (mirrors `learner-state`'s `priorEvents` pattern) — needed by
  `exposure-engine` to implement "existing assignment is honored."
- [ ] 2.3 Update/extend `assignment.test.ts` for both of the above.

## 3. `learner-state` recognition-modality filter

- [ ] 3.1 Introduce a recognition-modality set (initially `{"hear-tap"}`) owned by `learner-state`, and
  filter `computeMasteryStates` to only consider events whose `modality` is in that set — per the
  modified "Known-set and mastery projection" requirement.
- [ ] 3.2 Add the two new exposure modality identifiers (`expose-listen`, `expose-trace`) as valid
  `LearnerEvent.modality` values, explicitly outside the recognition-modality set.
- [ ] 3.3 Add/extend `mastery-projection.test.ts`: a tracing or listen-exposure success does not promote
  a character to `known`, and a recognition-modality (`hear-tap`) event still behaves exactly as before
  (regression coverage for the existing, now-filtered, behavior).

## 4. `exposure-engine` package

- [ ] 4.1 Scaffold `packages/exposure-engine`, mirroring `packages/assessment-engine`'s shape: package
  manifest, `types.ts` (arm ids, exposure session config, `SessionDeps`-equivalent injected clock/random
  dependencies), and an `ExposureSession` class.
- [ ] 4.2 Implement character selection by calling into `curriculum` (Phase A sequence, then
  scoring-based selection with the confusability spacing constraint) — no new ordering logic.
- [ ] 4.3 Implement arm resolution: look up an existing assignment for the selected character (2.2); if
  none exists, find its matched pair via `findMatchedPairs` and call `assignPairToArms`, recording the
  result via `AssignmentLog` — this replaces `assessment-engine`'s `recordMatchedPairAssignment`, moved
  to introduction time per design.md.
- [ ] 4.4 Implement exposure event construction: full `LearnerEvent` per the learner-state schema, with
  `modality` set to the delivered arm's identifier (`expose-listen` / `expose-trace`).
- [ ] 4.5 Unit tests: arm resolution honors an existing assignment; arm resolution creates and records one
  when missing; a matched pair's two members can resolve to different arms end-to-end;
  character-selection delegates to `curriculum` and doesn't reimplement it.

## 5. Remove now-superseded probe-time assignment

- [ ] 5.1 Remove `recordMatchedPairAssignment` and its call site from
  `packages/assessment-engine/src/session.ts`'s `nextProbe` (superseded by 4.3 — see design.md's
  "Arm assignment moves from probe time to introduction time").
- [ ] 5.2 Update `AssessmentSessionConfig`'s `arms` field/default and its doc comment
  (`assessment-engine/src/types.ts:46-47,63`) to reflect that arm assignment is no longer this package's
  concern, or remove the field entirely if nothing in `assessment-engine` still needs it once 5.1 lands.
- [ ] 5.3 Update `assessment-engine`'s existing tests for the removal (`frontier.test.ts` and any session
  test asserting on `getAssignments()`), and confirm hear-tap probing behavior is otherwise unchanged.

## 6. Exposure UI

- [ ] 6.1 Build `apps/assessment/src/exposure/ExposureScreen.tsx`: resolves the next character + arm via
  `exposure-engine`, renders the arm-specific content, and reaches a positive completion regardless of
  interaction quality (no grading, no digits) — per the `exposure` spec's "No grading or failure state."
- [ ] 6.2 Build the `listen` arm renderer: character shown large, spoken via the existing
  `audio/narration.ts` (`createSpeechSynthesisPromptVoice`), reusing `components/TapTarget.tsx` for the
  tap-to-continue interaction.
- [ ] 6.3 Build the `trace` arm renderer: `hanzi-writer`'s `quiz()` mode fed via the `charDataLoader`
  verified in 1.1, `showHintAfterMisses: false` / `highlightOnComplete: false`, template visible for the
  full interaction — per the `exposure` spec's "Guided tracing only." Wire `onMistake`/`onCorrectStroke`/
  `onComplete` callbacks into event logging only, never into visible feedback.
- [ ] 6.4 Confirm palm rejection during tracing uses the existing app-wide `input/pointer-gate.ts`
  singleton, the same one every `TapTarget` uses — no separate touch-handling path.
- [ ] 6.5 Add a post-unlock activity chooser in `apps/assessment/src/App.tsx`, so `AudioUnlockGate` can
  lead to either `ExposureScreen` or `BoutScreen` instead of only `BoutScreen` (lines 58-61 today). Any
  new Chinese copy must come from the existing font subset — no rebuild triggered by this task.
- [ ] 6.6 Component tests for `ExposureScreen` and both arm renderers, including an
  `assertNoScoreLikeText()`-equivalent assertion mirroring `BoutScreen.test.tsx`'s existing regression
  guard.

## 7. Offline queue and sync

- [ ] 7.1 Route exposure events through the existing offline event queue
  (`apps/assessment/src/offline/event-queue.ts`) and sync path (`offline/sync.ts`), with no new queue or
  sync mechanism.
- [ ] 7.2 Confirm exposure events round-trip through `offline/db.ts` and the sync endpoint with the same
  idempotency guarantees as assessment events (same client-generated id scheme).
- [ ] 7.3 Extend `offline/sync.test.ts` coverage for exposure events specifically.

## 8. Whole-workspace verification

- [ ] 8.1 Run full workspace build, typecheck, lint, and test; confirm all pre-existing tests
  (including `BoutScreen.test.tsx`'s `assertNoScoreLikeText()` assertions and `learner-state`'s
  mastery-projection tests) pass unmodified.
- [ ] 8.2 Manual desktop walkthrough of both arms via repeated exposure runs, confirming randomized
  arm assignment is reachable and neither arm shows any correctness marking, error state, or digit.
- [ ] 8.3 On-device iPad pass (fold into bootstrap task 10.0's pre-flight, not a separate device check):
  confirm Apple Pencil tracing with real palm rejection, and confirm the `listen` arm's zh-CN speech is
  actually audible.
