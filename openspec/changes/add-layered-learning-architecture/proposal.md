## Why

The project has grown a working learn → assess → review play loop, but the logic that decides *what
the learner does next* ended up inside the learner-facing app, with no contract around it.
`apps/assessment/src/session/activity-selector.ts` reaches directly into `@shizi/curriculum`'s
`composeBatch`, recomputes the known-set itself, derives its own "recently introduced" ordering from
raw events, and picks an activity — all in one app-local file that no spec describes. The app is
simultaneously the orchestrator, the renderer, and the place progression logic happens to live.

That works for one activity set and one learner, and it will not survive the next addition. Every new
activity (词 practice, 句 reading, the printed reader) has to reach into curriculum internals the same
ad-hoc way, and every new progression signal has to be re-derived at each call site. There is no
place to state "this is how the next batch of goals is decided" or "this is what the app is allowed
to know about progress," so both answers get re-invented per feature.

Naming the three layers — **curriculum** (what to learn next), **progression** (what the learner
knows), **learning** (what activity to run, and reporting back) — and giving each an explicit
contract makes those answers single-sourced. It also lets the character sequence be decided and
reviewed *ahead of time* rather than computed on the child's device mid-session.

## What Changes

- **Introduce a `learning-orchestration` capability** — the Learning Layer, as its own package rather
  than app-local code. It reads a progress context from the progression layer, requests the next
  batch of learning goals from the curriculum layer, selects which activity to deliver, and reports
  every outcome back. The app becomes a renderer that consumes its decisions, not the thing making
  them.
- **Define the three layer contracts explicitly**, each owned by the layer that produces it: the
  progression layer exposes a *progress context* (a read model, not raw events); the curriculum layer
  accepts that context and returns a *learning-goal batch*; the learning layer consumes the batch and
  reports outcomes. No layer reaches past its neighbour.
- **The curriculum layer's batch sequence becomes pre-generated and published**, computed repo-side at
  authoring time and shipped as reviewable static data, rather than recomputed on the device
  mid-session. This extends the existing slow-loop publishing path (`publish-config.ts` →
  `config.json`) that `bootstrap-shizi-assessment` task 9.4 already established and that
  `add-batched-curriculum-tagging`'s design already argued for ("the published plan is only a queue").
  The device keeps a local fallback so a missing or stale plan degrades rather than blocks.
- **Contracts are tier-generic from the start.** A learning-goal batch carries goals, not
  specifically characters — so when `add-tiered-content-progression` adds the 词 and 句 tiers, it fills
  in behind the same curriculum-layer interface instead of reshaping the layers. This change itself
  ships the character tier only; no 词/句 content is created here.
- **Retroactively specify the review activity's *delivery*** as `memory-review`. This activity already
  exists in working code (`session/memory-session.ts`, `memory/MemoryScreen.tsx`) with **no spec
  coverage at all** — it was built to close the learn → assess → review cycle. The learning layer
  cannot state which activities it selects among without this one being specified, so this change
  closes that hole rather than leaving a dangling reference. This is documenting built behavior, not
  new scope.
- **BREAKING to an accepted plan — this supersedes `add-memory-curve-review`'s delivery approach.**
  That change (proposed and merged, not yet implemented) states review folds into existing assessment
  bouts' easy-item dilution slots: *"No new activity, no new screen."* A separate review bout has
  since been built and verified on the dev deployment, so this change adopts the separate-activity
  shape instead and records the deviation rather than leaving a merged proposal and shipped code
  silently contradicting each other. What is superseded is **only** the delivery mechanism; see the
  ownership split below.
- **`review-scheduling` keeps sole ownership of due-ness.** `memory-review` covers *only* how a review
  bout is delivered — bout bounding, daily cadence, and the learner-facing guarantees. Which units are
  due, and in what order, stays entirely with `add-memory-curve-review`'s `review-scheduling`
  capability (the forgetting curve, predicted retention, queue ordering). This change defines no
  recency or interval rule of its own, so there is exactly one definition of due-ness in the system.
  Until `review-scheduling` is implemented, the learning layer supplies a placeholder queue; the
  contract is written against the queue, not the placeholder.
- **Relocate, not rewrite, the existing ad-hoc orchestrator.** `activity-selector.ts`,
  `memory-session.ts`, and `PracticeRouter.tsx`'s decision logic move behind the new layer boundary.
  The observable play loop does not change; where the decision lives does.
- **Not a breaking change to the event schema.** The progress context is a derived read model over the
  existing event log — no new persisted shape, no migration. (`add-tiered-content-progression` is the
  change that breaks that schema; this one deliberately does not touch it.)

## Capabilities

### New Capabilities
- `learning-orchestration`: The Learning Layer. Which activity the learner does next and why, the
  contract it uses to obtain a progress context and a learning-goal batch, the requirement that it
  never reimplements selection or mastery logic itself, and the obligation to report every activity
  outcome back to the progression layer.
- `memory-review`: Review-bout *delivery* — consuming a supplied due queue without redefining
  due-ness, bout bounding, at most one bout per day, that a review response feeds the same recognition
  projection as an assessment probe (so a missed review demotes correctly), and that nothing marks a
  bout as review to the learner. Retroactive coverage for already-built behavior; complements, and does
  not duplicate, `review-scheduling`.

### Modified Capabilities
- `curriculum`: Gains a batch-shaped, context-driven output contract — it accepts a progress context
  and returns a batch of learning goals, rather than exposing single-character selection as its
  primary surface. The batch sequence becomes a published, reviewable artifact produced ahead of time
  rather than computed per request. Purpose statement widens from "which character" to "which learning
  goals."
- `learner-state`: Gains a defined *progress context* read model as its outward-facing surface for
  other layers — what a consumer is entitled to know about progress, derived from the event log.
  Existing append-only/projection requirements are unchanged; this adds a consumer-facing contract on
  top so callers stop hand-rolling equivalent derivations.

## Impact

- **Packages**: new `learning-orchestration` package; `@shizi/curriculum` gains the batch/context
  contract and loses nothing; `@shizi/learner-state` gains the progress-context read model.
  `@shizi/exposure-engine` and `@shizi/assessment-engine` become activity implementations invoked
  *by* the learning layer rather than composed directly by the app.
- **App**: `apps/assessment` — `session/activity-selector.ts` and `session/memory-session.ts` move out
  of the app; `session/PracticeRouter.tsx` shrinks to rendering whatever the learning layer decides.
  Activity screens themselves (`BoutScreen`, `ExposureScreen`, `MemoryScreen`) are unaffected.
- **Infra**: `infra/sync-service/scripts/publish-config.ts` publishes the pre-generated batch plan;
  its currently-inlined greedy look-ahead loop is replaced by the curriculum layer's own batch
  composition.
- **Data**: a new published-plan field in `config.json`. No change to `data/events/*.jsonl` or the
  sync-service event store.
- **Overlap to reconcile, not duplicate**: `add-batched-curriculum-tagging`'s Section 6 ("Published
  batch plan") covers the same publishing surface. Its Section 1 (`composeBatch`/`composeBatchPlan`)
  is already implemented; Section 6 is not. This change takes over the publishing half; that change
  keeps the parent tag-review gate, which is a separate concern. Its tasks.md should be re-pointed
  rather than both changes editing `publish-config.ts`.
- **Sequencing**: independent of `add-tiered-content-progression` and safe to land before it — that
  change then implements 词/句 behind this change's contracts. Landing it *after* tiered-progression
  would mean designing the layers against a type surface that change is still moving.
- **`add-memory-curve-review` needs amending, not just noting**: its "Make review active inside
  existing bouts / no new activity, no new screen" bullet and its `assessment` dilution-slot delta are
  superseded by this change's separate-activity shape. Its `review-scheduling` capability is untouched
  and still needed. That change should be updated to consume the learning layer's review activity
  rather than the dilution slots — its own sequencing note (it depends on
  `add-tiered-content-progression`) means it has not started, so this costs no rework.
