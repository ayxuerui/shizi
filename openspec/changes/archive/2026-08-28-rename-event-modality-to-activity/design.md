## Context

- The vocabulary decision (`add-activity-mode-indicator` design, decision 1) locked **module**
  and **activity** as the unified words. This change carries them into the event schema, storage,
  and the research-facing spec prose.
- Current schema: `LearnerEvent.modality` with values `hear-tap` (assessment + review) and
  `expose-listen` / `expose-trace` (exposure). The `expose-` prefix exists as a structural guard:
  `DEFAULT_RECOGNITION_MODALITIES = {"hear-tap"}` promotes mastery, and exposure identifiers are
  deliberately outside that set (`add-tracing-modality-arm` design: "Exposure events use
  non-recognition modality identifiers").
- Data reality (verified): `data/events/events.jsonl` holds **20 events** dated 2026-08-23
  (identity-set hear-tap probes); the sync-service SQLite store carries the same era of data; the
  client IndexedDB holds this browser's dev-verification events. Bootstrap task 10.2 (first real
  session with the learner) is unchecked — the record is verification-stage, but possibly real
  play. **Translate, never discard.**
- The sync-service schema (`infra/sync-service/src/db.ts`) stores the column as `modality`;
  `pull-events.ts` exports it; backup round-trips assert on it.
- `add-tiered-content-progression` (unimplemented) plans its own event-schema break; this rename
  is independent of it and lands first.

## Goals / Non-Goals

**Goals:**

- One vocabulary everywhere: an event says which module produced it and which activity the child
  performed, in the same words every spec and screen uses.
- The recognition rule survives with its structural guard intact — teaching activities can never
  promote mastery, enforced by value membership, not by naming convention.
- All three storage layers migrate; the 20 canonical events survive the rename.

**Non-Goals:**

- No change to what is collected (same contextual fields), to arm randomization, or to any
  projection's semantics — mastery transitions are byte-for-byte identical on translated data.
- Not renaming the `Arm` type / `assignPairToArms` — "arm" names the experiment's assignment slot
  and stays.
- Not touching `add-tiered-content-progression`'s planned schema work.

## Decisions

### 1. Two fields — `module` and `activity` — not one module-qualified string

Events gain `module` (`learn`/`assess`/`review`) alongside `activity`
(`listen`/`trace`/`hear-tap`).

**Why:** the log has never recorded which module produced an event — assess-hear-tap and
review-hear-tap are indistinguishable today except by session forensics. Per-module event counts
and per-module calibration are the obvious first analyses the research register will want, and
the recognition rule becomes expressible without conventions. **Alternative rejected — one
module-qualified value** (`learn-listen`, `assess-hear-tap`): encodes two facts into one string,
forces every consumer to substring-parse, and makes the recognition set a two-element list
(`assess-hear-tap`, `review-hear-tap`) that grows with every hear-tap module.

### 2. Bare activity values; the `expose-` prefix's job is subsumed, not lost

Values are the activity ids themselves: `listen`, `trace`, `hear-tap`.

**Why the prefix guard still holds:** the guard's requirement is "teaching interactions never
promote mastery". Under the taxonomy, teaching activities ARE `listen` and `trace` — the
recognition set `{"hear-tap"}` excludes them by value membership, exactly as `expose-*` values
were excluded before. The prefix was a naming convention approximating the taxonomy; the taxonomy
now does the job directly. The spec states both halves: hear-tap promotes, listen/trace never do.

### 3. Recognition rule: `DEFAULT_RECOGNITION_ACTIVITIES = {"hear-tap"}`

`computeMasteryStates`'s filter config renames `recognitionModalities` → `recognitionActivities`;
semantics identical (streak over matching events only). The learner-context projection is
unaffected — it already separates presentation (all events) from mastery (recognition events).

### 4. Migration: rebuild + backfill at each layer, old→new mapping fixed and total

| Layer | Mechanism |
|---|---|
| sync-service SQLite | Table rebuild: create `events_new` with `module`/`activity`, copy + translate rows, drop old, rename (works on any SQLite ≥ 3.25, no `ALTER ... DROP` dependency); `SHIZI_ENV`-guarded, run at container start via a versioned migration step |
| canonical `data/events/*.jsonl` | One-time translate script (tsx, repo-side): rewrites `modality` → `module`+`activity`; writes a `.bak` sibling first; refuses to run twice |
| client IndexedDB | `DB_VERSION` bump; additive, `contains`-guarded upgrade rewrites stored rows to the new shape (the established upgrade discipline) |

Backfill mapping: `expose-listen` → (`learn`, `listen`); `expose-trace` → (`learn`, `trace`);
`hear-tap` → (`assess`, `hear-tap`). **Documented imprecision:** a legacy `hear-tap` event cannot
prove whether the review module produced it; every recorded event predates review's deployment
window, so `assess` is correct for the data that exists. Stated here so the assumption is
auditable rather than silent.

### 5. Arm values follow the activity ids; the word "arm" stays

`assignPairToArms` and assignment records store the assigned activity id; stored arm values
`expose-listen`/`expose-trace` are backfilled by the same mapping. "Arm" remains the experiment's
term for the assignment slot — renaming it would churn a spec'd, tested package to no vocabulary
gain, since it never competes with module/activity.

### 6. Spec coordination, same pattern as the layered change

`add-tracing-modality-arm`'s exposure delta specifies the `expose-*` identifiers and "teaching
modality" wording — this change's tasks amend that delta to the unified vocabulary (it is still
active, so the edit is a delta edit, not a main-spec hand-edit). `adaptivity-instrumentation`'s
**Purpose** ("learning modality effectiveness") cannot be changed by a delta — hand-edited per
the `add-layered-learning-architecture` task-8.1 precedent; its no-inference requirement is
delta'd here.

## Risks / Trade-offs

- **[Risk] The 20 canonical events may be real play; a botched translate loses them.** → The
  script writes a `.bak` before touching anything and refuses a second run; the sync-service
  rebuild copies rows inside a transaction; the old column's data remains in the `.bak` and in
  store backups (`harden-event-store`'s snapshot discipline).
- **[Risk] Divergent stores mid-rollout** (client writes `activity`, server expects `modality`).
  → The server migration ships and runs before any client build with the new schema syncs;
  `pull-events`/backup tests assert the new shape so the pairing is CI-checked, and the dev stack
  is rebuilt+restarted per `AGENTS.md` before verification.
- **[Risk] Backfill imprecision on legacy `hear-tap` events** (documented in decision 4). →
  Accepted at verification-stage data volumes; the assumption is written here and in the
  translate script's header.
- **[Trade-off] Two schema-adjacent changes now land in sequence** (this, then
  `add-tiered-content-progression`). Accepted: deferring this rename into that change couples a
  content-model break with a vocabulary rename and delays the vocabulary unification
  indefinitely; each break stays legible on its own.

## Migration Plan

1. Ship the sync-service migration (rebuild + backfill, guarded) and restart both stacks.
2. Run the jsonl translate script against `data/events/` (`.bak` created).
3. Land the client rename + IndexedDB upgrade; rebuild and ship dev per `AGENTS.md`.
4. Browser-verify: play one bout per module on dev; confirm events sync, back up, and re-pull
   with `module`/`activity` fields.

**Rollback:** each step is revertable by git + the `.bak`/snapshot copies; the SQLite rebuild
leaves the original table recoverable from the pre-migration backup taken by the migration step
itself.
