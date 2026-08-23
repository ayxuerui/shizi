## Context

See proposal.md — Why. What shapes the approach here is four existing facts in the codebase:

1. **The curriculum is a slow loop, computed off-device.** `publish-config.ts:3-4` says so
   explicitly: "curriculum's Loop 1 — a SLOW loop per design.md's fast/slow-loop table,
   deliberately NOT recomputed client-side." Its output lands in `config.json`.
2. **The look-ahead algorithm already exists.** `publish-config.ts:57-72` greedily calls
   `selectNextCharacter`, adding each pick to a simulated known-set and a sliding
   `recentlyIntroduced` window — exactly the provisional-state composition a batch needs. It
   currently produces a flat `nextTargets` list of 10, read by nobody
   (`published-config.ts:41-46`).
3. **`ratings` is a complete worked precedent** for a parent-supplied, non-`LearnerEvent`
   stream: its own IndexedDB store, one shared validator, a sibling POST route, a
   natural-keyed table with `INSERT OR IGNORE`, and its own JSONL export.
4. **There is no teaching flow yet.** `apps/assessment` probes; it does not introduce. The
   thing a batch is a batch *of* does not exist in this repo today.

## Goals / Non-Goals

**Goals:**
- Batch composition lives in `@shizi/curriculum` as a tested function, not inlined in a
  deployment script.
- Tag capture is durable, offline-first, append-only, and lands back in the durable
  character-data source without introducing a second store of record.
- Adding a fourth durable stream does not break the nightly backup.

**Non-Goals:**
- Building the teaching flow that consumes a batch (see the decision below).
- Biasing assessment probe selection toward the upcoming batch. Genuinely useful — you would
  learn whether she already knows a batch before teaching it — but it changes `assessment`
  behavior and belongs in its own change.
- Any change to how `tagSource` gates selection. It gates nothing today; keeping that true
  is what makes this change unable to regress selection.

## Decisions

### Batch size defaults to 5 because `recentWindowSize` is 5

The intra-batch confusability guarantee is not a new rule — it is the existing spacing
constraint applied during composition. Composing a batch by calling `selectNextCharacter`
with each prior pick appended to `recentlyIntroduced` means the constraint already covers the
whole batch, **provided the batch is no longer than the window**. At batch size 7, positions
1 and 7 fall outside each other's window and a confusable pair can co-occur.

So `batchSize` defaults to 5 and the spec states the guarantee as a requirement rather than
leaving it implicit in a coincidence of two config values. *Alternative considered:* a larger
batch with a separate intra-batch constraint — rejected as a second mechanism doing what one
already does.

### `composeBatch` absorbs the script's inlined loop

`publish-config.ts:57-72` moves into `@shizi/curriculum` as `composeBatch` (one batch) plus
`composeBatchPlan` (N consecutive batches, same provisional-state carry).
`selectNextCharacter` remains the primitive and is unchanged.

Rationale: this is curriculum logic with real edge cases — the Phase A boundary, a batch that
cannot be filled without violating spacing — and it currently lives in an untested deployment
script. *Alternative considered:* extracting a `rankCandidates` helper and letting the app
compose batches client-side. Rejected: it contradicts the slow-loop decision in (1) above.

### A batch, once opened, is frozen locally; the published plan is only a queue

The published plan is computed from the known-set at publish time, which lags by up to a
backup/publish cycle. If the app tracked "current batch" as an index into the published plan,
a republish could silently swap out characters the child is mid-way through learning.

So: when the parent closes a review and opens a batch, the app persists that batch's concrete
character list as local state of record. The published plan supplies candidates for
*not-yet-opened* batches only, and the app filters the next published batch against its own
local known-set before opening it, which absorbs plan staleness. Batches are identified by
content, never by index.

### Several batches are published ahead, so advancing needs no connectivity

`parent-review` requires that advancing works offline against the plan already on the device.
The plan therefore carries a configurable number of batches (default 4, i.e. 20 characters —
roughly the existing `NEXT_TARGETS_COUNT = 10`, doubled, at no meaningful cost since it is
just character strings in a JSON file already carrying the whole pool).

### `CharacterTag` is keyed `(character, taggedAt)`, not `character`

Append-only, latest-`taggedAt`-wins on read via `latestTagPerCharacter`. Corrections append;
nothing mutates or deletes.

The reason is specific, not stylistic: `concreteness` gates matched-pair randomization
(`packages/adaptivity/src/matching.ts:29` requires an exact match), and pairs are assigned at
introduction time. Overwriting a tag would destroy the only evidence of which historical pairs
were matched on a value that has since been corrected — a silent hole in the experiment's
control. This also matches `learner-state`'s `EventLog`, which is append-only by construction
rather than by convention.

*Alternative considered:* key on `character` with `INSERT OR REPLACE`. Simpler, and wrong for
the above reason.

### A tag record always carries both attributes

`build-tags.mjs:84-93` marks a row `reviewed` only when *both* reviewed columns are filled —
deliberately, because "a half-reviewed row is still draft." Rather than teach the capture path
a different rule, a `CharacterTag` carries both `concreteness` and `pictographic` together, so
a captured record can never produce a half-reviewed row. The review UI pre-fills both from
current values, so confirming an unchanged value is one tap, not data entry.

### Fold-back goes through the CSV, keeping one store of record

`apply-tag-events.mjs` folds `data/events/tags.jsonl` into `data/tagging-review.csv`'s
reviewed columns; `build-tags.mjs` then runs **unchanged**, since its per-row fallback logic
already handles a partially reviewed file correctly.

*Alternative considered:* `build-tags.mjs` reads the JSONL directly. Rejected — it would leave
two sources able to disagree about the same character, and would strand the hand-edit path
that `data/TAGGING-REVIEW.md` documents and that remains the fallback when the app is
inconvenient.

### The review screen reuses the diagnostics entry pattern

Unlabeled corner long-press on the unlock screen plus a hash route — the mechanism
`DiagnosticsCornerTrigger.tsx` and `diagnostics/entry.ts` already establish, reusing
`createLongPress`, `TapTarget`, and `diagnostics/theme.ts`. That header comment already argues
the placement: the unlock screen is the one screen every cold start shows, it is gone once the
child starts playing, and it works in standalone mode where there is no address bar.

*Alternative considered:* extend the end-of-session `ParentRatingPrompt`. Rejected — it is
deliberately one tap on a child-visible screen, and `BoutScreen`'s tests assert no
score-like text reaches the child's tree.

### Shipping the gate before the thing it gates, deliberately

There is no teaching flow yet, so "a batch does not begin until its review is closed" gates a
consumer that arrives with `printed-reader`. This is the project's established pattern, not a
new liberty: design.md's "Validator built ahead of its first consumer" and the
matched-pair-assignment decision ("record assignments regardless, so that when `modality-arms`
ships, historical assignment records already exist") both do exactly this.

What ships useful *today* regardless: the review surface and tag capture, which is what
finally closes task 3.3. The batch structure is what makes that review recur at a natural
moment instead of being a chore. Flagged here rather than left for a reader to discover.

## Risks / Trade-offs

**A fourth export stream silently disables the nightly backup** → The real failure mode, and
the reason `deployment` is in scope. `backup-and-push.ts:68-70` excludes exactly three
hardcoded paths from its clean-clone check; an unlisted `data/events/tags.jsonl` reads as an
unrelated local change and fires `CleanCloneGuardError`, so the job refuses to run — and the
only symptom is backups quietly stopping. Mitigation: add the path to both the pathspec list
and the `git add` set, and cover it with a test that fails if a new stream is ever added
without updating that list.

**`DB_VERSION` 2 → 3 upgrade on a device holding the only copy of some events** → The
`upgrade` callback must remain purely additive (`createObjectStore` for `tags` only, guarded
by `objectStoreNames.contains`, exactly as the existing three are). `deployment`'s
"Client-side retention is a documented, relied-upon backstop" requirement makes local events
load-bearing, so a destructive upgrade is a data-loss path. Mitigation: additive-only
upgrade, plus a test that opens a v2-shaped database and asserts existing records survive.

**Tags reviewed after a character was already introduced** → Batches are reviewed *before*
they open, so within this design tags are corrected ahead of introduction. But the ~180
characters in not-yet-reached batches stay on drafts for a long time, and any pair matched
from them uses draft concreteness. Accepted: the append-only record is what makes this
auditable later, and this is strictly better than today, where *every* character is on drafts.

**A parent who never opens the review stalls new characters indefinitely** → By design, but it
must not stall *practice*. Mitigated by the `parent-review` requirement that the gate blocks
introduction only, and that a session with a pending review runs on already-introduced
characters.

**Publish cadence couples the plan to the backup job** → `publish-config.ts` reads
`data/events/events.jsonl`, regenerated by `backup-cron`. A stalled backup means a stale plan.
Mitigated by publishing several batches ahead and by the app filtering a published batch
against its local known-set before opening it. `git log -1 -- data/events/` remains the
existing health check.

## Migration Plan

Additive throughout; no data migration.

1. Library work first (`composeBatch`, `CharacterTag`, `validateCharacterTag`) — pure
   additions, no consumer affected.
2. `backup-and-push.ts`'s canonical-path list **before** anything writes `tags.jsonl`, so the
   nightly job never sees an unlisted file.
3. Sync service route/table/export, then client store and flush.
4. `publish-config.ts` emits the batch plan; the app reads it behind `published-config.ts`'s
   existing bundled-fallback-on-any-failure path, so a client running against an older
   `config.json` degrades rather than breaks.
5. Review screen last.

Rollback: the review screen and the published plan can each be reverted independently. Already
captured `CharacterTag` records remain valid and re-appliable — they are append-only records in
the durable export, not state coupled to the UI that produced them.

## Open Questions

- **Default batch-lookahead depth.** Set at 4 batches. Purely a config value; changing it
  after real use alters no spec, approach, or task.
- **Whether the review should also collect the missing frequency ranks for 悟/空/姥/木.** Out
  of scope here; the screen is the obvious future host for it, and that can be decided once
  the surface exists.
