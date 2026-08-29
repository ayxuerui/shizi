## Why

Two gaps sit between "we log everything Eliana does" and "she actually retains what she has learned".

**Nothing is stored.** The event store holds raw interactions and nothing else — `events` in
`infra/sync-service/src/db.ts` is a flat row keyed on a bare `character TEXT`. Every derived view
(mastery, known-set) is recomputed in memory on the client and discarded when the tab closes. There
is no persisted answer to "what does she know at the 字 tier, and at the 词 tier?", so nothing
outside a running app session can see her progress, and nothing survives an IndexedDB eviction
except the raw log.

**Nothing decays.** `computeMasteryStates` is driven purely by event *order* — elapsed time never
enters it. A character confirmed `known` in June is still `known` in August with zero intervening
exposure, which is the one thing we know is false about a 4-year-old's memory. The repo already
admits the gap in prose (`known-set-projection.ts`: "`shaky` is one she's learned before and is due
for review") but there is no scheduler behind it: a unit only gets reviewed if the frontier search
or the easy-item rotation happens to draw it. Review is incidental, not active.

This change makes progress a persisted, per-tier projection in the database, and puts a forgetting
curve behind it so that units come back up *because they are due*.

## What Changes

- **Add a memory-curve retention model.** Each unit carries a half-life; predicted recall decays as
  `2^(-elapsed / halfLife)`. Fast-correct responses lengthen the half-life, a miss collapses it back
  toward the floor, and a slow-but-correct response leaves it unchanged — reusing the guess-detection
  latency semantics `learner-state` and `assessment-engine` already share rather than inventing a
  second notion of "counted as correct". Parameters are fixed and configurable per tier; **nothing
  is fitted from data**, consistent with `adaptivity-instrumentation`'s standing rule against
  premature inference.
- **Materialize a per-unit progress projection, keyed by kind-qualified unit.** Mastery state,
  exposure and correct counts, last-seen time, current half-life, and next-due time are persisted
  for every 字 and every 词 — in the sync service's SQLite store (durable) and in the app's
  IndexedDB (so scheduling works with no network). One shared implementation computes both; neither
  copy is independently editable, and both are fully reconstructible by replaying the event log.
- **Make review active inside existing bouts.** The due queue becomes an input to item selection:
  the felt-difficulty dilution slots — the 4-in-5 "guaranteed success" items — are filled from the
  due queue first, falling back to the current identity/known rotation when nothing is due. Due
  units are by construction already-known units, so the felt success rate is preserved. A
  configurable cap keeps a large due backlog from consuming every easy slot. No new activity, no new
  screen, and nothing about scheduling is ever shown to Eliana.
- **Add a rebuild path.** A repo-side script recomputes the whole progress projection from the event
  log, and a version stamp on the stored projection makes a model or parameter change a rebuild
  rather than a data-loss event. The JSONL export stays events-only — derived progress is
  recomputable and must not compete with `data/events/events.jsonl` as the canonical record.

## Capabilities

### New Capabilities
- `review-scheduling`: The forgetting curve and the review queue — per-unit predicted recall as a
  function of elapsed time, how a response updates the interval, per-tier parameterization, the
  due-ordering contract, the requirement that due units are actively surfaced rather than waited on,
  and the requirement that none of this scheduling machinery is visible to the learner.

### Modified Capabilities
- `learner-state`: Adds a materialized, version-stamped per-unit progress projection in the durable
  store — persisted derived state, which the capability today deliberately does not have — bounded
  by the existing append-only and replay guarantees, and by an explicit statement that the canonical
  export remains events-only.
- `assessment`: "Felt-difficulty dilution" changes — easy slots are drawn from the due-review queue
  before the identity/known rotation, under a configurable share cap.

## Impact

- **Packages**: `review-scheduling` (new) — the curve, the progress-record builder, and the due
  queue as pure functions with an injected clock; `learner-state` (progress-record type and its
  place in the projection story); `assessment-engine` (`dilution.ts` and `session.ts` take a due
  queue).
- **Infra**: `infra/sync-service` — a `unit_progress` table updated in the same transaction as the
  event insert in `handle-sync.ts`, plus a `rebuild-progress` script alongside `pull-events.ts` and
  `publish-config.ts`. The existing whole-file SQLite backup covers the new table with no change.
- **App**: `apps/assessment` — a `progress` object store in `src/offline/db.ts`, refreshed from the
  local event log so the due queue is available offline; session wiring to pass the queue into
  `AssessmentSession`.
- **Docs**: `infra/README.md` gains the rebuild script.
- **No new runtime dependencies**, and no change to what ships in the child's bundle beyond the
  scheduling package itself.
- **Sequencing — depends on `add-tiered-content-progression` (0/76).** Tracking progress at the 词
  tier requires that tier to exist: `content-model`'s kind-qualified unit reference, the `word-data`
  pool, and the migrated event schema all come from that change. This change deliberately does not
  define its own word pool or its own kind discriminant, so it should not start until that change
  has landed. It also touches the same `learner-state` and `assessment-engine` type surface that
  `bootstrap-shizi-assessment` (58/67) and `add-tracing-modality-arm` (0/28) are still landing
  against.
