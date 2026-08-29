## Context

See proposal.md — Why. The design-relevant current state:

- **The orchestrator already exists, app-local and unspecified.**
  `apps/assessment/src/session/activity-selector.ts` holds `decideActivity`,
  `deriveRecentlyIntroduced`, and `computeDueForMemory`; `session/PracticeRouter.tsx` loads events
  from IndexedDB, calls `decideActivity`, keeps the last-review date in `localStorage`, and remounts
  a module screen under a bumped `key` to advance. `session/memory-session.ts` holds a whole
  module engine inside the app. This works and was verified end to end against the dev deployment;
  it is the thing being relocated, not replaced.
- **Two module engines are already packages**, with a consistent shape: a headless, injected-deps
  engine class (`@shizi/assessment-engine`'s `AssessmentSession`, `@shizi/exposure-engine`'s
  `ExposureSession`) plus a React hook in the app that owns lifecycle (`use-assessment-session.ts`,
  `use-exposure-session.ts`). `memory-session.ts` is the odd one out, being app-local.
- **`learner-state` already owns projections** and states it as a requirement: "All derived state ...
  SHALL be computed as a projection over the event log." The app currently violates the spirit of that
  by deriving introduction order and exposure recency itself.
- **`computeMasteryStates` filters to recognition modalities** (`DEFAULT_RECOGNITION_MODALITIES`), so
  an exposure-only unit has *no* mastery entry at all. "Has been presented" and "has a mastery state"
  are therefore different questions over different event subsets.
- **The slow-loop publishing path exists but is unread.** `infra/sync-service/scripts/publish-config.ts`
  emits `knownSet` and a flat `nextTargets` list (an inlined greedy look-ahead loop);
  `apps/assessment/src/session/published-config.ts` reads only `probePool` and `difficultyParams`.
  Verified: nothing in the repo reads `nextTargets`.
- **`composeBatch`/`composeBatchPlan` already exist** in `@shizi/curriculum` (from
  `add-batched-curriculum-tagging` Section 1) and are unit-tested, but are currently called
  client-side from the app, not at publish time.
- **Hard offline requirement** (`assessment`, `exposure` specs): nothing learner-facing may block on a
  network call. This rules out a runtime curriculum service and is why the layers are packages.

## Goals / Non-Goals

**Goals:**

- One place that answers "what does the learner do next," reachable only through a stated contract.
- Progress facts derived once, in the layer that owns the event log, not per consumer.
- Contracts shaped so the 词/句 tiers land behind them without reshaping the layers.
- Behavior-preserving relocation: the verified play loop must look identical to the learner afterward.

**Non-Goals:**

- No change to any module's own internals. `BoutScreen`, `ExposureScreen`, and the review bout's
  interaction stay as they are; only who decides to run them changes.
- No event-schema change and no data migration. (`add-tiered-content-progression` is the change that
  breaks that schema.)
- No runtime service, no network dependency on the learner-facing path.
- Not building a general module-plugin system. Three module kinds do not justify a registry.

## Decisions

### 1. The learning layer is a headless package plus a thin app adapter

`packages/learning-orchestration` holds the decision logic as a pure, injected-deps module; the app
keeps a small React adapter that renders whatever it decides. This mirrors the established
engine/hook split the other two module engines already use.

**Why not keep it in the app behind an interface:** the goal is that the *next* feature cannot reach
around the contract. An app-local module has no dependency boundary — nothing stops a new screen
importing `composeBatch` directly, which is exactly how the current situation arose. A package
boundary makes the bypass visible in a dependency graph.

**Why not put it in `@shizi/curriculum`:** curriculum answers "what should be learned next," which is
deliberately independent of "what module should run and when." Folding module selection into
curriculum would give it a reason to know about module kinds, review scheduling, and daily cadence —
none of which belong to sequencing.

### 2. The layer returns a decision; the app still owns engine lifecycle

`nextModule(context, plan)` returns a decision value — a module kind plus the inputs that
module needs — and the app instantiates the corresponding engine as it does today.

**Why not have the learning layer own the engines:** each engine's lifecycle is genuinely
React-shaped in this app (refs guarding StrictMode double-invocation, `requestAnimationFrame` latency
origins, resolve-delay timers). Pulling that into a headless package would put React lifecycle
concerns inside a layer whose whole value is being pure and testable without rendering.

**How the reporting requirement is still met:** the learning layer exposes an explicit
`reportModuleOutcome` seam that each module adapter calls on completion, and that call is what
advances the layer's own state (frozen batch progress, review-completed-today). Per-event writes
continue through the existing offline queue into `learner-state`, unchanged — the layer is *told* what
happened rather than duplicating event persistence. Without this seam the layer would have to
re-read the event log to notice its own decision completed, which is the re-derivation this change
exists to remove.

### 3. Learner context is computed in `learner-state`, and separates "presented" from "mastered"

`learner-state` gains a `LearnerContext` projection carrying: mastery state per unit, the known set,
the set of units ever presented, last-exposure time per unit, and first-introduction ordering.
`deriveRecentlyIntroduced` and the last-exposure map move out of the app into this projection.

The load-bearing detail: **"ever presented" is derived from all events; mastery is derived only from
recognition-modality events.** An introduction-only unit is presented with no mastery entry. This is
not a nuance — collapsing the two is a real bug that surfaced during the current implementation (an
exposure-only unit looked "unseen," so the orchestrator re-taught it forever). The context reports
both facts separately so no consumer can conflate them again.

**Alternative rejected — let each consumer keep deriving what it needs:** that is the status quo, and
it already produced two subtly different notions of "seen" in one file.

### 4. Review becomes a peer module package

`memory-session.ts` moves to `packages/memory-review-engine`, alongside `assessment-engine` and
`exposure-engine`. The capability is named `memory-review`; the package carries the `-engine` suffix,
matching the existing `assessment` capability ↔ `@shizi/assessment-engine` package precedent.

**Why not fold review into `assessment-engine`:** it was considered and rejected during
implementation for a concrete reason — `AssessmentSession`'s felt-difficulty dilution draws its easy
pool from the learner's *entire* known set with no way to restrict it to a supplied due-list.
Reusing it would either review the wrong units or require reshaping a spec'd, well-tested engine for
a capability its spec does not cover.

### 4a. Review splits into scheduling (elsewhere) and delivery (here)

`review-scheduling`, from the already-merged `add-memory-curve-review` proposal, keeps sole ownership
of *which* units are due and in what order — the forgetting curve, predicted retention, queue
ordering, and the "evaluation time is supplied, not read" discipline. `memory-review` owns only
*delivery*: bout bounding, one bout per local calendar day, and the learner-facing guarantees. The
learning layer passes a due queue in; the review bout never applies a recency rule of its own.

**Why the split rather than one capability:** two definitions of due-ness is the actual failure mode
to avoid, and the first draft of this change had one (a naive "N days unseen" rule sitting alongside
that change's half-life model). Splitting on scheduling-vs-delivery leaves exactly one owner for
each question.

**What this supersedes, explicitly:** `add-memory-curve-review` states review folds into existing
bouts' easy-item dilution slots — "No new module, no new screen." A separate review bout has since
been built and verified on the dev deployment, so that delivery mechanism is superseded. Recording it
here matters because the alternative is a merged proposal and shipped code that contradict each other
with nothing saying which won.

**Compatibility preserved deliberately:** that change's "Scheduling is invisible to the learner"
requirement — no due count, no overdue indicator, a review item presented indistinguishably from any
other — is carried into `memory-review` verbatim in intent rather than dropped. The superseded part is
*where* review happens, not *whether the learner can tell*.

**Until `review-scheduling` exists**, the learning layer supplies a placeholder queue derived from
last-exposure recency (what the current implementation already does). The contract is written against
the queue, so replacing the placeholder with the real curve changes no consumer.

### 5. The batch plan is composed at publish time; the device freezes the batch it opens

`publish-config.ts` calls `composeBatchPlan` and emits an `upcomingBatches` plan, replacing its
inlined greedy loop. The device reads the plan, filters the next batch against its current progress
context at the moment it opens it, and then persists that concrete batch as local state of record.

This adopts `add-batched-curriculum-tagging`'s design decision verbatim rather than re-litigating it:
"A batch, once opened, is frozen locally; the published plan is only a queue," with batches identified
by content and never by index — so a republish cannot swap out units the learner is partway through.

**`nextTargets` is removed rather than kept.** That change's task 6.1 proposed keeping it populated
for existing readers; verified against the repo, there are none, so carrying a dead published field
is worse than dropping it.

### 6. Orchestration state persists in the existing IndexedDB database, not `localStorage`

The frozen current batch and the last-review date go into a new object store in the app's existing
IndexedDB database, replacing today's `localStorage` last-review date.

**Why:** the frozen batch is a list, not a scalar, and `localStorage` has no schema-versioning story.
The app's IndexedDB database already has an established additive, `contains`-guarded upgrade
discipline. The upgrade must stay purely additive — `deployment`'s "Client-side retention is a
documented, relied-upon backstop" requirement makes locally-held events load-bearing, so a
destructive upgrade is a data-loss path.

### 7. A learning goal carries kind plus identity, chosen to be adoptable by `content-model`

Goals are `{ kind, id }`, deliberately the same shape as `add-tiered-content-progression`'s planned
`ContentRef`. That change can then adopt or supersede this type without consumers changing — the
difference becomes a rename, not a reshape.

**Coordination note, not a hidden assumption:** if `add-tiered-content-progression` lands first, this
change should use its `ContentRef` directly instead of defining its own. Two definitions of unit
identity in one repo is the failure mode to avoid.

## Risks / Trade-offs

- **[Risk] Relocating working, human-verified code can regress the play loop.** The current loop was
  confirmed end to end against the dev deployment (learn → assess → review, both exposure arms, a real
  stale-unit review). → Move behind the boundary with the decision logic's tests written first, keep
  the observable loop byte-for-byte identical in behavior, and re-verify the same walkthrough on the
  dev URL before considering it done. Any behavior change discovered during the move is a bug in the
  move, not an improvement to accept silently.
- **[Risk] Two changes editing `publish-config.ts`.** `add-batched-curriculum-tagging` Section 6 covers
  the same publishing surface and is unimplemented. → This change owns the publishing half; that
  change's tasks.md is re-pointed to reference it rather than both editing the script. Its parent
  tag-review gate is unaffected and stays its own concern.
- **[Risk] `add-tiered-content-progression` breaks the event schema this design reads.** → The goal
  reference is shaped to be adoptable (decision 7), and the learner context is a projection, so a
  schema change re-derives it rather than migrating it. Whichever change lands second rebases onto
  the other; they must not edit unit identity concurrently.
- **[Trade-off] Indirection with no user-visible payoff in this change.** The learner sees nothing
  new; the loop she plays is the one that already works. The return is entirely in what the next
  capability costs to add. Worth stating plainly rather than implying this change improves the
  experience — it does not, by design.
- **[Trade-off] The app still constructs engines**, so the layer boundary is a contract plus
  convention rather than something the type system fully enforces. Accepted: the alternative puts
  React lifecycle inside a headless layer (decision 2), which trades a worse problem for a better
  one.
- **[Risk] The frozen local batch and the published plan drift apart over a long offline stretch.** →
  Filter at open time against current progress; identify batches by content; publish several batches
  ahead so advancing never needs connectivity.

## Migration Plan

No data migration — the learner context is derived, and the event schema is untouched. Each step is
independently landable and leaves the app working:

1. Add the `LearnerContext` projection to `learner-state` (pure addition, no consumer changes yet).
2. Add curriculum's context-driven batch contract over the existing `composeBatch`/`composeBatchPlan`.
3. Create `packages/learning-orchestration` with the decision logic ported from `activity-selector.ts`,
   tests first, reading the new projection instead of re-deriving.
4. Move `memory-session.ts` into `packages/memory-review-engine`.
5. Add the orchestration-state object store (additive, guarded); migrate the last-review date off
   `localStorage`.
6. Repoint `PracticeRouter.tsx` at the learning layer and delete the app-local decision code.
7. Publish `upcomingBatches` from `publish-config.ts`; consume it in `published-config.ts`; drop
   `nextTargets`.
8. Re-verify the full learn → assess → review walkthrough on the dev deployment.
9. Hand-edit `openspec/specs/curriculum/spec.md`'s Purpose (a delta cannot change a Purpose), widening
   it from "which character a learner should encounter next" to cover batches of learning goals.

**Rollback:** every step is an ordinary code change, revertable by git. Step 5's object-store addition
is additive and guarded, so reverting the code leaves an unused store rather than lost data. Step 7
changes a published artifact's fields; reverting republishes the prior shape, and the device's
existing fallback-on-any-failure path tolerates either.

## Open Questions

- The concrete review interval, review-bout size, and published batch-lookahead depth. Config seams
  exist either way; the right numbers come from watching real sessions, exactly as the existing Loop-4
  difficulty calibration is tuned.
- Whether the learning layer should eventually own engine lifecycle too (decision 2's alternative).
  Deferrable: it changes no spec requirement and no contract, only where lifecycle code sits, so it
  can be revisited if a second consuming app ever exists.
