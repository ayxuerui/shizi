## Why

Loop 3's entire instrumentation is live and measuring nothing. `bootstrap-shizi-assessment` built matched-pair
finding, random arm assignment, and append-only assignment records (`packages/adaptivity`), wired them into every
first-ever character exposure (`assessment-engine/src/session.ts:193`), and shipped exactly one arm —
`arms: ["hear-tap"]` (`assessment-engine/src/types.ts:63`). With one arm, `assignPairToArms` short-circuits
(`adaptivity/src/assignment.ts:35`) and both members of every matched pair land on the same arm, so the randomization
records a constant. Worse, the assigned arm is never *honored*: `MODALITY` is a module constant
(`session.ts:27`) and the learner sees hear-tap regardless of what was assigned. The apparatus was deliberately
built early (`bootstrap` design.md:118) on the premise that a second arm would arrive before it mattered.

**Now is the cheapest moment this will ever be.** `data/` contains no event export and bootstrap task 10.2 (first
real session with the learner) has not run, so there is zero historical learner data and zero real assignment
records. Shipping the second arm before that first session means the entire corpus is arm-randomized from event
one. Shipping it after means a single-arm prefix that can never contribute to a modality comparison, growing with
every session run in the meantime.

## What Changes

- **New `exposure` capability**: the first *teaching* activity in the project. Where the assessment measures what
  the learner already recognizes, exposure introduces a not-yet-known character selected by the existing
  `curriculum` capability. Arm assignment routes *how* that introduction happens.
- **Two exposure arms**, so the matched-pair randomization has something to randomize between:
  - `listen` — the character shown large, spoken, learner taps it. The baseline; closest to how 悟空识字 introduces
    a character.
  - `trace` — guided stroke-following via `hanzi-writer`'s `quiz()` mode, template-guided throughout, with
    `showHintAfterMisses: false` and `highlightOnComplete: false` per `bootstrap` design.md:77 (verified in
    `spikes/hanzi-writer-quiz/`).
- **Guided tracing only.** Free handwriting production from memory remains deferred to ~age 5–6 per `bootstrap`'s
  proposal. The distinction is written into the `exposure` spec as a requirement, not left as a code comment, so a
  later contributor cannot quietly widen it into unguided production.
- **The assigned arm becomes binding.** An arm assignment now determines the exposure form actually delivered.
  Recording an assignment that nothing reads was acceptable while one arm existed; it is not once two do.
- **Arm assignment moves from probe time to introduction time.** Assigning at first assessment probe is now
  premature — frontier search probes characters that often turn out to be already known, which never need
  introducing, so their assignment records are noise. This supersedes `bootstrap` design.md:118, whose stated
  purpose was to preserve historical assignments for characters introduced before other arms existed; with no
  sessions run, there is no such history to preserve and nothing is lost.
- **Tracing outcomes must never promote a character to `known`.** Stroke-following accuracy is not recognition.
  Exposure events are logged with full fidelity but excluded from the known-set/mastery projection.
- **Explicitly unchanged: the assessment bout.** It stays pure hear-tap and remains the sole measurement
  instrument. That separation is what keeps the treatment from confounding the measurement, and it means
  `assessment`'s requirements — including "No visible scoring or failure state" and its digit-free-DOM
  regression tests — are untouched by this change.
- **Not a breaking change** in the user-visible sense (no existing behavior is removed), but the `Arm` value set
  and `AssessmentSessionConfig.arms` default both change. Safe only because no data exists yet; see design.md.

## Capabilities

### New Capabilities

- `exposure`: introduction of a not-yet-known character through an arm-assigned modality — arm resolution and
  binding, the `listen` and `trace` exposure forms, the guided-tracing-only boundary, the no-grading guarantee
  carried over from the assessment's no-failure framing, and exposure event logging.

### Modified Capabilities

- `adaptivity-instrumentation`: adds a requirement that a recorded arm assignment SHALL govern the modality
  actually delivered to the learner, and that the configured arm set SHALL contain at least two arms for the
  randomization to carry signal. The "No inference performed" requirement is reaffirmed unchanged — this change
  ships arms to route between, not the routing logic or any effectiveness estimate.
- `learner-state`: qualifies the "Known-set and mastery projection" requirement so that only
  recognition-modality events count toward `known`/`shaky` transitions. Today the requirement says "two
  consecutive correct responses" with no modality qualification, which would let tracing successes promote a
  character the learner cannot actually read.

## Impact

- **New package** `packages/exposure-engine` — arm resolution, curriculum-driven character selection for
  introduction, exposure event construction. Mirrors `packages/assessment-engine`'s shape and its
  injected-dependency determinism discipline (`SessionDeps`).
- **New UI** `apps/assessment/src/exposure/` — the exposure screen and the two arm renderers. (The app directory
  keeps its `assessment` name despite now hosting a second activity; renaming the single PWA is churn without
  benefit and is out of scope.)
- **Modified**: `packages/adaptivity` (arm value set, assignment lookup by character), `packages/assessment-engine`
  (`arms` default; removal of probe-time assignment), `packages/learner-state` (recognition-modality filter in the
  mastery projection; new `modality` values), `apps/assessment/src/offline/` (exposure events through the existing
  queue and sync path).
- **New runtime dependency**: `hanzi-writer` (MIT) only — the first time it enters the app rather than a spike.
  `hanzi-writer-data` is deliberately **not** added: all 209 pool characters, identity set included, already ship
  ordered stroke paths and per-stroke medians in `packages/character-data/src/data/stroke-data.ts`, with
  `ARPHICPL.TXT` and `CHANGES.md` already bundled alongside them. The library is fed from `character-data` via its
  `charDataLoader` option, so bootstrap task 3.8's Arphic obligation stays discharged and does not reopen.
- **Consumes, does not change, `curriculum`**: Phase A sequencing, scoring-based selection, and the confusability
  spacing constraint already answer "which character next" and are already built.
- **No stroke-data eligibility filter needed**: stroke-path coverage across the pool is complete, and
  `character-data`'s existing "Missing attribute blocks use" requirement already excludes any character lacking a
  required attribute from curriculum selection — so both arms inherently draw from the same eligible set with no
  new requirement and no confound.
- **Sequencing**: worth landing before bootstrap task 10.2 (first real session) so Loop 3 data is clean from the
  start. Does not depend on the outcome of the task 10.0 device pass, but shares its risk surface — the `listen`
  arm needs the same zh-CN `SpeechSynthesis` availability the assessment's "hear" half needs
  (`bootstrap` design.md:208).
