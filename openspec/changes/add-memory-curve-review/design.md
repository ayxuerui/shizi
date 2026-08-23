## Context

See proposal.md — Why. The relevant existing shape:

- `packages/learner-state` is pure and event-sourced: `computeMasteryStates` folds an event list into
  a `Map<unit, MasteryState>`, `computeKnownSet` widens `known ∪ shaky` into the usable set. No
  elapsed time enters either. Events already carry `latencyMs`, `daysSinceLastExposure`, and
  `priorExposureCount`, so the inputs a curve needs are all present in the log today.
- `packages/assessment-engine` already separates *which slot* from *which item*:
  `isInformativeSlot(index, config)` decides slot type on a fixed 4:1 block, and
  `pickEasyItem(easyPool, cursor)` rotates through the easy pool. `AssessmentSession` injects all
  randomness and time through `SessionDeps` and never reads the wall clock — the same discipline
  `@shizi/adaptivity`'s `AssignmentDeps` follows.
- `infra/sync-service` stores events in SQLite with `INSERT OR IGNORE` on the client-generated `id`,
  and `scripts/pull-events.ts` regenerates `data/events/events.jsonl` as the canonical durable record.
- `apps/assessment/src/offline` keeps every event in IndexedDB and exposes `loadPriorEvents()`, which
  `AssessmentSession` already consumes as `priorEvents`. So a client-side projection has its input
  locally, offline, today.
- `add-tiered-content-progression` is the prerequisite: it replaces `character: string` with a
  kind-qualified unit reference and makes mastery per-tier. This design writes against that shape and
  does not introduce a parallel one.

## Goals / Non-Goals

**Goals:**

- One implementation of the curve, consumed by both the app and the sync service, so a client-computed
  due queue and a server-stored progress row can never disagree.
- Scheduling state that is a pure function of `(events, config, now)` — replayable, testable without a
  clock, and cheap enough to recompute at bout start at this data volume (thousands of events, not
  millions).
- Review that rides inside the existing bout structure, changing which item fills an easy slot and
  nothing else about how a bout is composed or presented.

**Non-Goals:**

- No fitting of curve parameters from Eliana's own data. Parameters are hand-set constants; fitting is
  exactly what `adaptivity-instrumentation`'s "No inference performed" requirement forbids at this data
  volume, and would be a separate change with its own analysis story.
- No parent-facing progress UI, no due-count badge, no notifications. The DB rows exist to be durable
  and queryable; presenting them is a later change.
- No change to frontier probing, distractor selection, difficulty calibration, or the mastery state
  machine. `shaky` keeps its current meaning.
- No sentence (句) tier. This change covers 字 and 词, matching the request.

## Decisions

### 1. Half-life decay, not a Leitner ladder and not FSRS

Predicted retention is `R(Δt) = 2^(−Δt / halfLifeDays)`, where `Δt` is days since last exposure and
`halfLifeDays` is per-unit state. A unit is due when `R ≤ targetRetention`, which is equivalent to
`Δt ≥ halfLifeDays · log2(1 / targetRetention)` — so "due" is a plain timestamp we can store, while
`R` remains available as a continuous risk score for ordering.

Interval update, applied by folding events in timestamp order:

| Event | Effect on `halfLifeDays` |
| --- | --- |
| First exposure | `= initialHalfLifeDays` (default 1.0) |
| Correct, `latency < tierThreshold` | `×= growthFactor` (default 2.0), clamped to `maxHalfLifeDays` |
| Correct, `latency ≥ tierThreshold` | unchanged |
| Incorrect | `= max(minHalfLifeDays, halfLifeDays × lapseFactor)` (default 0.25) |

`targetRetention` defaults to **0.9**, not the ~0.5 typical of adult SRS. Two reasons: a lapse costs
more here (a 4-year-old's response to failure is disengagement, not annoyance), and the assessment
already targets 80–85% rolling accuracy — a scheduler tuned to 50% recall would fight that band by
design. With a 1-day starting half-life, the due interval is `halfLife × log2(1/0.9) ≈ 0.152 ×
halfLife`: a just-introduced unit comes due about 3.5 hours later — the same day, plausibly the next
bout — and a unit answered fast five times running sits at a 16-day half-life ≈ a 2.4-day interval,
doubling from there.

Reusing `tierThreshold` — the *same* guess-detection threshold `mastery-projection.ts` and
`guess-detection.ts` already use — is deliberate. Two different definitions of "counted as a real
success" in one codebase is a bug waiting to happen; the slow-correct case behaves consistently
(doesn't promote mastery, doesn't extend the interval).

**Alternative rejected — Leitner / SM-2 interval ladder:** discrete boxes give no continuous score, so
a day with 30 due units has no principled ordering within the day, and SM-2's quality grade has no
source — Eliana cannot self-rate recall, so the grade would have to be synthesised from
outcome+latency anyway, at which point the ladder is the only thing SM-2 is still contributing.

**Alternative rejected — FSRS:** better model, wrong stage. Its difficulty/stability parameters want
fitting against review logs the project does not have, and shipping unfitted default weights is
strictly worse than an explicit two-parameter curve whose behaviour we can reason about and hand-tune.

### 2. A new `@shizi/review-scheduling` package

One capability per package, matching the existing layout. It depends on `content-model` (for the unit
reference) and `learner-state` (for `LearnerEvent`, `MasteryState`), and is depended on by
`assessment-engine`, `apps/assessment`, and `infra/sync-service`. Dependency direction stays acyclic:
`learner-state ← review-scheduling ← assessment-engine`.

**Why not inside `learner-state`:** `learner-state`'s contract is *the canonical record and what she
knows*. The curve is a *policy* with tunable constants that we fully expect to change after watching
real sessions. Keeping it separate means a parameter change never touches the package that owns the
append-only guarantees, and the two have different test shapes (record invariants vs. numeric
behaviour under time).

Surface, all pure, no wall clock:

- `computeUnitProgress(events, config) → Map<UnitKey, UnitProgress>` — the fold. `UnitProgress`
  carries mastery state, exposure/correct counts, `lastSeenAt`, `halfLifeDays`, `dueAt`.
- `predictedRetention(progress, now)` and `isDue(progress, now, config)`.
- `buildReviewQueue(progressMap, now, config) → ReviewQueueEntry[]` — ascending `R`, tie-broken by
  `(kind, unitId)` so the ordering is total and reproducible per the spec.

`now` is always a parameter. Follows the `SessionDeps`/`AssignmentDeps` precedent.

### 3. Materialize on both sides, from one function, and treat both as caches

- **Server:** a `unit_progress` table in `infra/sync-service/src/db.ts`, primary key `(kind, unit_id)`,
  holding the `UnitProgress` fields plus `projection_version`. `handle-sync.ts` updates the affected
  rows inside the *same* `better-sqlite3` transaction as the event insert, and only for events that
  actually inserted — so a duplicate re-send, which already returns `inserted: false`, cannot
  double-count (spec: "Duplicate event does not double-count").
- **Client:** a `progress` object store in `apps/assessment/src/offline/db.ts`, rebuilt from
  `loadPriorEvents()` at bout start and rewritten at bout end. At this data volume a full recompute is
  microseconds and removes any chance of client-side drift; the store exists so a cold start has a
  queue before it has finished any recompute, not as an authority.

Neither copy is an input to the next projection — the fold always reads events. That is what keeps
`learner-state`'s "all derived state is a projection" property true with a materialized table present,
and what makes `projection_version` sufficient: bump it, rebuild, done.

**Incremental server update vs. always-full rebuild:** incremental is chosen because sync writes are
per-event and a full replay on every request is wasteful, but the incremental path is defined as
"re-fold that unit's events", not "patch the row" — so it is the same function over a filtered event
set, and the spec's "incremental equals full rebuild" scenario is a real test, not a hope.

`scripts/rebuild-progress.ts` sits alongside `pull-events.ts` and `publish-config.ts`: reads the live
store, re-folds everything, replaces the table in one transaction. It is the recovery path for a
version bump, a corrupted table, or a parameter change.

**Export stays events-only.** `pull-events.ts` is untouched. A derived table in `events.jsonl` would
give the project two things claiming to be the record of truth; the spec pins this down.

### 4. Review rides the dilution slots, not a new slot type

`isInformativeSlot` is untouched — the 4:1 block and frontier probing are unchanged. Only
`pickEasyItem` changes: it takes the review queue and a `reviewShareOfEasySlots` cap (default 0.5),
serves due units in queue order up to the cap, and falls back to the existing identity/known rotation
otherwise.

This works precisely because a due unit is an *already-learned* unit. The easy slot's contract is
"guaranteed success", and a unit at 90% predicted recall satisfies that better than most — while a
frontier probe would not. So review gets a natural home with no new slot type, no change to the felt
success ratio, and no new presentation path (which is also how the "invisible to the learner"
requirement is satisfied structurally rather than by remembering not to render a badge).

The 0.5 cap is the one guard: if 40 units come due after a two-week gap, half the easy slots still go
to identity-set items, so a bout after a long absence does not turn into a wall of half-remembered
material.

### 5. Retention is orthogonal to mastery, not a replacement for it

`MasteryState` keeps its current event-order semantics, and `computeKnownSet` keeps including `shaky`.
Retention adds the time axis alongside it; the two are combined only at selection time (a unit is
review-eligible if it is in the known set *and* due). Redefining `shaky` as "low predicted retention"
was considered and rejected: `shaky` is load-bearing for `content-validator`'s shaky-seeding advisory
and for the assessment's probe candidacy, and quietly changing its meaning would alter those behaviours
as a side effect of adding a scheduler.

## Risks / Trade-offs

- **Hand-set parameters may schedule badly for one real child.** → Every parameter is per-tier config
  with a documented default, and the projection is a replay: observing that reviews come too often is a
  config edit plus a rebuild, not a data problem.
- **`targetRetention = 0.9` produces a lot of review early on** (1-day initial half-life ⇒ next-day due
  for everything new). → The `reviewShareOfEasySlots` cap bounds the per-bout impact, and the informative
  slots — where new learning happens — are untouched.
- **Two materialized copies can disagree if one is stale.** → Both are caches over the same fold, both
  version-stamped, and neither feeds the next projection; a disagreement is resolved by rebuilding, and
  the client rebuilds every bout anyway.
- **`daysSinceLastExposure` on the event and `lastSeenAt` in the projection are two paths to the same
  fact.** → The projection computes elapsed time from `timestamp` only; the event field stays a recorded
  observation for later analysis and is never an input to scheduling.
- **Full client-side recompute is O(events) per bout.** → Fine for thousands of events; if the log ever
  outgrows it, the materialized client store is already there to become the incremental path, using the
  same server-side pattern.
- **Blocked on `add-tiered-content-progression`.** → Accepted deliberately (see proposal.md — Impact).
  Building a private word representation to unblock earlier would create exactly the duplicate type
  surface that change exists to prevent.

## Migration Plan

1. Land `add-tiered-content-progression` first. This change assumes kind-qualified events and the 词 pool.
2. Ship `@shizi/review-scheduling` with tests. Nothing consumes it yet — no behaviour change.
3. Add `unit_progress` + the transactional update + `rebuild-progress.ts` to the sync service. The table
   is created empty by `CREATE TABLE IF NOT EXISTS`; run the rebuild once to backfill from the existing
   log. Still no learner-visible change.
4. Add the client `progress` store and populate it at bout boundaries. Still no behaviour change — the
   queue is computed but not consumed.
5. Wire the queue into `pickEasyItem`. This is the only step Eliana can perceive, and it is a one-line
   revert if the review load feels wrong in practice.

**Rollback:** steps 2–4 are additive and revertable by git; the `unit_progress` table can be left in
place harmlessly since nothing else reads it. Step 5 is the only behavioural one. No event data is
modified at any point, so there is no data rollback to plan.

## Open Questions

- Whether `growthFactor = 2.0` is too aggressive for the 词 tier specifically — a word may need more
  repetitions than a character before its interval doubles. Deferred: it is a per-tier config value, so
  answering it after a few weeks of real sessions changes a constant, not the specs, the approach, or
  the task breakdown.
