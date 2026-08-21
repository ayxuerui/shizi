## Context

See proposal.md - Why for the motivation (Loop 3's instrumentation is live with a single arm and an
unhonored assignment). This section covers only the current state that shapes the approach.

- `packages/assessment-engine/src/session.ts` hard-codes `const MODALITY = "hear-tap"` (line 27) and
  calls `recordMatchedPairAssignment` at first-ever exposure to a character during frontier-search probe
  selection (`nextProbe`, line 164), before the outcome of that probe is known.
- `packages/adaptivity`'s `Arm` type is a bare `string` (`types.ts:2`); `assignPairToArms` degrades to a
  no-op split when `arms.length === 1` (`assignment.ts:35`).
- `packages/character-data/src/data/stroke-data.ts` already carries ordered stroke paths and per-stroke
  medians (Make Me a Hanzi coordinate system) for all 209 pool characters, including the identity set
  (薛亦霖, 小蓝莓), with `ARPHICPL.TXT` + `CHANGES.md` already bundled. Verified directly by parsing the
  generated module.
- `spikes/hanzi-writer-quiz/` already verified `hanzi-writer`'s `quiz()` mode against 4 characters using
  `hanzi-writer-data`, with `showHintAfterMisses: false` / `highlightOnComplete: false` suppressing all
  on-character correctness feedback. `bootstrap` design.md:69-81 records the adoption decision but notes
  (line 150) the built assessment never ended up needing it — this change is the first real consumer.
- `apps/assessment/src/App.tsx` renders `AudioUnlockGate` wrapping `BoutScreen` directly (lines 58-61) —
  there is currently exactly one post-unlock destination.
- No learner event data exists yet: `data/` holds no event export, and bootstrap task 10.2 (first real
  session) has not run.

## Goals / Non-Goals

**Goals:**
- Give Loop 3's randomization a second arm to route between, and make the assigned arm binding.
- Keep the assessment bout as the sole recognition-measurement instrument, untouched.
- Reuse `curriculum` for character selection and `character-data` for stroke content — build no parallel
  sequencing or content pipeline.

**Non-Goals:**
- No modality-effectiveness inference (`adaptivity-instrumentation`'s "No inference performed in this
  change" requirement is unaffected and unchanged by this proposal).
- No unguided/free handwriting production — deferred to ~age 5-6 per `bootstrap`'s proposal, and encoded
  as a spec requirement here so it cannot be quietly widened.
- No third arm (词-context, etymology-reveal) — future `modality-arms` follow-on work per `bootstrap`
  proposal.md's own out-of-scope list.
- No change to `bout-machine.ts`, `BoutState`, or the assessment's session-bound logic.

## Decisions

### Exposure is a separate activity, not a probe kind or a bout segment
**Decision:** exposure is its own screen, launched from a post-unlock activity chooser, with its own
completion bound — not a slot type inside `nextProbe`'s dilution machinery, and not prepended to a bout.

**Rationale:** the assessment bout's entire value is that it measures recognition cleanly. Folding
introduction into the same instrument that measures it (either as a probe kind or a bout-prefixed
segment) confounds treatment with measurement and pulls `bout-machine.ts`, `BoutState`, and the 60-90s
session-length requirement into scope for no benefit. Keeping them fully separate means
`BoutScreen.test.tsx`'s `assertNoScoreLikeText()` assertions and every other assessment-spec regression
signal stay untouched, and it's the only shape that avoids needing to co-decide how the bound is split.

**Alternatives considered:** an "introduce" probe kind reusing `isInformativeSlot`'s slot pattern
(rejected — puts a teaching step inside the measurement instrument, the exact confound this decision
avoids); prepending one exposure item to each bout (rejected — either eats into the fixed bound or
extends it, pulling session-length scope into this change for a small UX convenience).

### Arm assignment moves from probe time to introduction time
**Decision:** `recordMatchedPairAssignment` moves out of `assessment-engine`'s `nextProbe` and into
`exposure-engine`, firing when exposure resolves which arm to deliver for a character — not when the
assessment happens to probe it for the first time.

**Rationale:** frontier search probes a not-yet-known character to find the frontier boundary; many
probed characters turn out to already be known and are never introduced through exposure at all. Under
the old timing, every such character still got a matched-pair assignment record that no introduction
event will ever follow — pure noise for a future modality comparison. Moving assignment to introduction
time means every assignment record corresponds to a character that was actually introduced through one
arm or the other.

This explicitly supersedes `bootstrap` design.md:118's stated reasoning ("record assignments regardless,
so that when `modality-arms` ships additional arms, historical assignment records already exist for
characters introduced earlier"). That reasoning protected historical assignments predating this change.
Verified there are none: `data/` has no event export and task 10.2 hasn't run, so there is no history to
lose by changing the timing now. If this change landed after real sessions existed, this decision would
need revisiting.

**Alternatives considered:** keep assignment at probe time, add delivery at introduction time separately
(rejected — leaves the noise-record problem above unsolved, and requires the same lookup-by-character
work regardless).

### `hanzi-writer`, fed from `character-data`, not `hanzi-writer-data`
**Decision:** add `hanzi-writer` (MIT) as a real dependency; feed it from
`packages/character-data`'s existing stroke data via `hanzi-writer`'s `charDataLoader` option, rather
than adding the `hanzi-writer-data` npm package.

**Rationale:** `hanzi-writer-data` would duplicate data already in the repo under a second license
surface. `character-data`'s stroke data has 100% coverage of the pool (verified directly, all 209
characters including identity-set ones) and already discharges the Arphic obligation via
`ARPHICPL.TXT` + `CHANGES.md` (bootstrap task 3.8). No new license-notice work is needed.

**Residual risk, not yet resolved:** `hanzi-writer-data` is described as Make Me a Hanzi data "with some
slight tweaks" (`spikes/hanzi-writer-quiz/PROVENANCE.md`); our `stroke-data.ts` is raw MMH. The spike
verified `hanzi-writer` against `hanzi-writer-data`, not against raw MMH coordinates through a custom
`charDataLoader`. This must be verified as the first implementation task before building the `trace` arm
on the assumption it works unmodified — see tasks.md.

**Alternatives considered:** add `hanzi-writer-data` alongside (rejected — redundant data, a second
license file to track for content that's a strict subset of what's already bundled).

### Exposure events use non-recognition modality identifiers; `known`/`shaky` reads only recognition modalities
**Decision:** exposure events carry modality identifiers (e.g. `expose-listen`, `expose-trace`) that are
excluded from a `learner-state`-owned "recognition-modality set" the mastery projection filters on;
`hear-tap` (the assessment's existing modality) is the initial member of that set.

**Rationale:** the mastery projection's "two consecutive correct responses" language has no modality
qualifier today, so an unfiltered read would let tracing successes (a production/motor-copying task) or
even passive listening promote a character to `known` — a recognition claim it doesn't support. Owning
the recognition-modality set in `learner-state` (rather than, say, an assessment-side filter) keeps the
projection's invariant single-sourced, matching this project's existing discipline of not letting derived
state diverge from where it's computed.

**Alternatives considered:** filter in `assessment-engine` before computing mastery (rejected — the
projection function is shared and called from multiple places; a filter outside it could be forgotten by
a future caller, whereas filtering inside `computeMasteryStates` makes the exclusion structural).

## Risks / Trade-offs

- **[Risk]** `hanzi-writer`'s `charDataLoader` may not accept raw MMH coordinates without transformation,
  since the spike only exercised `hanzi-writer-data`, not this integration path → **Mitigation:** verify
  this first, before any other implementation work, per tasks.md; if it fails, fall back to vendoring
  `hanzi-writer-data` for the specific characters needed and revisit the license-notice work this design
  currently claims is avoided.
- **[Risk]** The `listen` exposure arm depends on the same unverified zh-CN `SpeechSynthesis` iPad Safari
  availability the assessment's hear-tap "hear" half depends on (`bootstrap` design.md:208) → **Mitigation:**
  shares the existing `audio/narration.ts` capability check; no new risk surface, and resolved by
  bootstrap task 10.0's device pass rather than duplicated here.
- **[Trade-off]** Exposure has no measurement of its own — a tracing session doesn't itself tell you
  whether the learner recognizes the character, only that they traced it. The comparison only closes
  when a later hear-tap bout re-probes that same character → accepted; this is precisely what keeps
  exposure and assessment un-confounded (see the separate-activity decision above), and is the intended
  design, not a gap.
- **[Trade-off]** Removing probe-time assignment changes when `AssignmentLog` entries appear relative to
  `bootstrap`'s original design → accepted; no historical data exists to break (see decision above), and
  the new timing produces more meaningful records, not fewer.

## Migration Plan

No data migration — no events or assignment records exist yet. Rollout is a single deploy:

1. Verify the `hanzi-writer`/`character-data` integration in isolation (spike-style check) before
   building the `trace` arm on top of it.
2. Implement `exposure-engine`, the arm-set/lookup changes in `adaptivity`, the recognition-modality
   filter in `learner-state`, and the UI, in the order tasks.md lays out.
3. Full workspace build/typecheck/lint/test, with special attention to `BoutScreen.test.tsx`'s
   `assertNoScoreLikeText()` and `learner-state`'s mastery-projection tests passing unmodified.
4. Land before bootstrap task 10.2 (first real session), so the learner's very first exposure event is
   already arm-routed.

**Rollback:** static hosting redeploy to the prior build, same as `bootstrap` design.md's Migration
Plan — no data-shape rollback needed since no learner data yet exists that this change's schema
additions could orphan.

## Open Questions

- Exact exposure-session bound (how many characters introduced per sitting, if more than one) is left
  to tasks.md/implementation judgment — it doesn't change any spec requirement above, all of which are
  per-interaction, not per-session.
- Whether a third arm (词-context, etymology-reveal) is worth building, and when, is explicitly deferred
  to a future `modality-arms` follow-on per `bootstrap` proposal.md's own out-of-scope list; not a
  blocker for this change's two-arm minimum.
