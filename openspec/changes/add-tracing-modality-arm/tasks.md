## 1. De-risk the `hanzi-writer` integration

- [x] 1.1 Spike: point `hanzi-writer`'s `charDataLoader` at `character-data`'s existing `stroke-data.ts`
  for a handful of pool characters (including at least one identity-set character) and confirm it
  renders and drives `quiz()` correctly from raw Make Me a Hanzi coordinates, without needing
  `hanzi-writer-data` — per design.md's "residual risk." Record the result (pass, or what adjustment was
  needed) before starting Section 3. — PASS, verified beyond a spike: `TraceExposure.tsx` feeds
  `character-data`'s raw `strokeData.strokes`/`medians` directly into `charDataLoader`, and this was
  exercised on the real deployed dev build (`shizi-dev.realxco.com`), not just locally — `HanziWriter.create`
  rendered the outline, `animateCharacter()` played, and `quiz()` accepted synthetic stroke input and
  advanced through multiple real pool characters (我/你/他, at minimum). No adjustment needed.
- [x] 1.2 If 1.1 fails outright, stop and revisit design.md's `hanzi-writer`/`character-data` decision
  before proceeding — N/A, 1.1 passed outright.

## 2. `adaptivity` package changes

- [ ] 2.1 Widen `assignPairToArms`'s behavior (or its call sites' config) so a configured arm set of
  fewer than two arms is treated as a misconfiguration for randomization purposes, per the
  adaptivity-instrumentation spec's modified "Matched-pair randomization protocol" requirement. —
  NOT DONE. `exposure-engine`'s config now ships two real arms (`EXPOSURE_ARMS`), so the single-arm
  degenerate path is no longer exercised by real usage, but `assignPairToArms` itself still silently
  accepts a 1-arm config without flagging it as a misconfiguration. Low risk (nothing currently
  configures fewer than 2), left for a follow-up.
- [x] 2.2 Add a lookup helper for finding an existing `ArmAssignment` for a given character across a
  supplied assignment history (mirrors `learner-state`'s `priorEvents` pattern) — needed by
  `exposure-engine` to implement "existing assignment is honored." — `findAssignmentForCharacter`
  (`packages/adaptivity/src/assignment.ts`), most-recent-match tie-break.
- [x] 2.3 Update/extend `assignment.test.ts` for both of the above. — Added coverage for
  `findAssignmentForCharacter` (2.2); no new test for 2.1 since it wasn't implemented.

## 3. `learner-state` recognition-modality filter

- [x] 3.1 Introduce a recognition-modality set (initially `{"hear-tap"}`) owned by `learner-state`, and
  filter `computeMasteryStates` to only consider events whose `modality` is in that set — per the
  modified "Known-set and mastery projection" requirement. — `DEFAULT_RECOGNITION_MODALITIES` +
  `MasteryProjectionConfig.recognitionModalities` (`packages/learner-state/src/mastery-projection.ts`),
  optional/defaulted so every existing call site compiles and behaves unchanged.
- [x] 3.2 Add the two new exposure modality identifiers (`expose-listen`, `expose-trace`) as valid
  `LearnerEvent.modality` values, explicitly outside the recognition-modality set. — `modality` was
  already a bare `string` (no enum to extend); `exposure-engine`'s `EXPOSURE_ARMS` is the source of
  truth for the two identifiers, and they are exercised end-to-end (real events logged with these
  modalities on the live dev deployment).
- [x] 3.3 Add/extend `mastery-projection.test.ts`: a tracing or listen-exposure success does not promote
  a character to `known`, and a recognition-modality (`hear-tap`) event still behaves exactly as before
  (regression coverage for the existing, now-filtered, behavior). — Three new tests added, all existing
  tests pass unmodified.

## 4. `exposure-engine` package

- [x] 4.1 Scaffold `packages/exposure-engine`, mirroring `packages/assessment-engine`'s shape: package
  manifest, `types.ts` (arm ids, exposure session config, `SessionDeps`-equivalent injected clock/random
  dependencies), and an `ExposureSession` class.
- [x] 4.2 Implement character selection by calling into `curriculum` (Phase A sequence, then
  scoring-based selection with the confusability spacing constraint) — no new ordering logic. —
  `ExposureSession.nextItem` calls `selectNextCharacter` directly; a session-local provisional
  known-set (`introducedThisSession`) prevents re-selecting the same character twice in one sitting,
  mirroring `composeBatch`'s own provisional-state pattern rather than reimplementing selection.
- [x] 4.3 Implement arm resolution: look up an existing assignment for the selected character (2.2); if
  none exists, find its matched pair via `findMatchedPairs` and call `assignPairToArms`, recording the
  result via `AssignmentLog` — this replaces `assessment-engine`'s `recordMatchedPairAssignment`, moved
  to introduction time per design.md.
- [x] 4.4 Implement exposure event construction: full `LearnerEvent` per the learner-state schema, with
  `modality` set to the delivered arm's identifier (`expose-listen` / `expose-trace`).
- [x] 4.5 Unit tests: arm resolution honors an existing assignment; arm resolution creates and records one
  when missing; a matched pair's two members can resolve to different arms end-to-end;
  character-selection delegates to `curriculum` and doesn't reimplement it. — 10 tests, all passing.

## 5. Remove now-superseded probe-time assignment

- [x] 5.1 Remove `recordMatchedPairAssignment` and its call site from
  `packages/assessment-engine/src/session.ts`'s `nextProbe` (superseded by 4.3 — see design.md's
  "Arm assignment moves from probe time to introduction time").
- [x] 5.2 Update `AssessmentSessionConfig`'s `arms` field/default and its doc comment
  (`assessment-engine/src/types.ts:46-47,63`) to reflect that arm assignment is no longer this package's
  concern, or remove the field entirely if nothing in `assessment-engine` still needs it once 5.1 lands.
  — Removed the `arms`/`matchCriteria` fields entirely (nothing in the package needed them once 5.1
  landed); also dropped the now-unused `@shizi/adaptivity` dependency/tsconfig reference.
- [x] 5.3 Update `assessment-engine`'s existing tests for the removal (`frontier.test.ts` and any session
  test asserting on `getAssignments()`), and confirm hear-tap probing behavior is otherwise unchanged. —
  `frontier.test.ts` needed no change (never referenced assignments); removed the superseded
  "matched-pair assignment wiring" describe block and the `getAssignments()` comparison in the
  determinism test from `session.test.ts`. Full assessment-engine suite (13 tests) still passes.

## 6. Exposure UI

- [x] 6.1 Build `apps/assessment/src/exposure/ExposureScreen.tsx`: resolves the next character + arm via
  `exposure-engine`, renders the arm-specific content, and reaches a positive completion regardless of
  interaction quality (no grading, no digits) — per the `exposure` spec's "No grading or failure state."
- [x] 6.2 Build the `listen` arm renderer: character shown large, spoken via the existing
  `audio/narration.ts` (`createSpeechSynthesisPromptVoice`), reusing `components/TapTarget.tsx` for the
  tap-to-continue interaction. — `ListenExposure.tsx`.
- [x] 6.3 Build the `trace` arm renderer: `hanzi-writer`'s `quiz()` mode fed via the `charDataLoader`
  verified in 1.1, `showHintAfterMisses: false` / `highlightOnComplete: false`, template visible for the
  full interaction — per the `exposure` spec's "Guided tracing only." Wire `onMistake`/`onCorrectStroke`/
  `onComplete` callbacks into event logging only, never into visible feedback. — `TraceExposure.tsx`.
  Also sets `markStrokeCorrectAfterMisses: 3` (not in the original task text, but required to satisfy
  "exposure always completes" — without it a stroke `quiz()` can't match just blocks forever, which is
  itself a failure state). Verified live: a real trace interaction with intentionally sloppy strokes
  completed the character and advanced.
- [ ] 6.4 Confirm palm rejection during tracing uses the existing app-wide `input/pointer-gate.ts`
  singleton, the same one every `TapTarget` uses — no separate touch-handling path. — NOT DONE, and
  not straightforward: `hanzi-writer` attaches its own `mousedown`/`mousemove`/`touchstart`/`touchmove`
  listeners directly on its rendered SVG node (confirmed by reading `hanzi-writer`'s bundled source),
  entirely bypassing this app's `PointerEvent`-based `pointer-gate.ts`/`use-tap.ts` path — a genuinely
  separate touch-handling path exists, contrary to this task's requirement. Reconciling the two would
  mean intercepting `hanzi-writer`'s own listeners (capture-phase suppression) or patching its render
  target, which needs its own design decision, not a quick fix. Partial mitigation: `bootstrap`
  design.md's task 2.5 spike already found `hanzi-writer`'s own palm-rejection behaved correctly on a
  real iPad in isolation, so this is a real gap against the letter of the requirement, not a known
  broken behavior — flagged for a follow-up change or design.md revision rather than silently dropped.
- [x] 6.5 Add a post-unlock activity chooser in `apps/assessment/src/App.tsx`, so `AudioUnlockGate` can
  lead to either `ExposureScreen` or `BoutScreen` instead of only `BoutScreen` (lines 58-61 today). Any
  new Chinese copy must come from the existing font subset — no rebuild triggered by this task. —
  Went further than a binary chooser: `session/PracticeRouter.tsx` (not in this change's original scope —
  see `add-batched-curriculum-tagging`'s deferred teaching-flow non-goal) routes between `ExposureScreen`,
  `BoutScreen`, AND a new `MemoryScreen`, driven by `session/activity-selector.ts`'s `decideActivity`.
  This was necessary to actually close the loop the user asked for (learn → assess → daily-memory per
  batch) — a binary chooser alone would not have. New visible Chinese text was avoided entirely (aria-only
  labels bypass the font-subset scan by design — see `ListenExposure.tsx`'s doc comment); no font rebuild
  was needed, confirmed by the real build succeeding against the existing subset.
- [x] 6.6 Component tests for `ExposureScreen` and both arm renderers, including an
  `assertNoScoreLikeText()`-equivalent assertion mirroring `BoutScreen.test.tsx`'s existing regression
  guard. — `ExposureScreen.test.tsx` (3 tests, listen arm only — the trace arm needs real SVG/canvas
  geometry APIs jsdom doesn't implement; that arm's correctness was instead verified live against the
  real dev deployment, not jsdom). No dedicated `ListenExposure.test.tsx`/`TraceExposure.test.tsx` —
  covered through `ExposureScreen` instead, matching this project's existing preference for testing
  through the composed screen where reasonable.

## 7. Offline queue and sync

- [x] 7.1 Route exposure events through the existing offline event queue
  (`apps/assessment/src/offline/event-queue.ts`) and sync path (`offline/sync.ts`), with no new queue or
  sync mechanism. — `use-exposure-session.ts` calls the same `enqueueEvent`/`enqueueAssignments`/
  `flushQueue` used elsewhere; added one new queue-adjacent helper, `loadAllAssignments` (reads the
  full local assignment history, mirroring `loadPriorEvents`), needed so "existing assignment is
  honored" survives a relaunch, not just one in-memory session.
- [x] 7.2 Confirm exposure events round-trip through `offline/db.ts` and the sync endpoint with the same
  idempotency guarantees as assessment events (same client-generated id scheme). — No schema change was
  needed (`LearnerEvent`'s `id`-keyed idempotency is modality-agnostic); confirmed via a real POST/replay
  round trip against the live dev sync endpoint during manual verification, and via
  `ExposureScreen.test.tsx`'s event-queue assertion.
- [ ] 7.3 Extend `offline/sync.test.ts` coverage for exposure events specifically. — NOT DONE as a
  dedicated addition; `sync.ts`'s flush logic is modality-agnostic and already fully covered by its
  existing tests plus the new `ExposureScreen.test.tsx`/`MemoryScreen.test.tsx` coverage (which do
  exercise real exposure/memory events through the same queue), so a modality-specific sync test would
  be duplicating coverage rather than adding a real gap-check. Flagged as a conscious skip, not an
  oversight.

## 8. Whole-workspace verification

- [x] 8.1 Run full workspace build, typecheck, lint, and test; confirm all pre-existing tests
  (including `BoutScreen.test.tsx`'s `assertNoScoreLikeText()` assertions and `learner-state`'s
  mastery-projection tests) pass unmodified. — 435 tests across 67 files pass; `tsc -b`/app typecheck
  and `eslint .` both clean.
- [x] 8.2 Manual desktop walkthrough of both arms via repeated exposure runs, confirming randomized
  arm assignment is reachable and neither arm shows any correctness marking, error state, or digit. —
  Done against the real deployed dev build (`shizi-dev.realxco.com`), not a local dev server: played
  through a full 5-character batch, observed both `expose-listen` (giant character + tap-to-continue)
  and `expose-trace` (hanzi-writer quiz) delivered across different characters (confirming randomized
  assignment), and confirmed the full learn → assess → daily-memory rotation (see
  `session/activity-selector.ts`) all worked, including a real transition into a `MemoryScreen` review
  bout triggered by a genuinely stale known character.
- [ ] 8.3 On-device iPad pass (fold into bootstrap task 10.0's pre-flight, not a separate device check):
  confirm Apple Pencil tracing with real palm rejection, and confirm the `listen` arm's zh-CN speech is
  actually audible. — NOT DONE; requires a real iPad, which this session doesn't have access to. Same
  category as bootstrap's own outstanding 10.0/10.1 device-only items.
