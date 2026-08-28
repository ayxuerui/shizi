## Why

The vocabulary decision locked in `add-activity-mode-indicator` is **module** (learn/assess/review)
and **activity** (listen/trace/hear-tap), unified across product and research — no split registers.
The event log still speaks the old register: field `modality`, values `expose-listen` /
`expose-trace` / `hear-tap`. Every contributor would carry a permanent mapping
("activity ↔ the event's `modality` field"), and the log cannot even say which *module* produced an
event. Unifying now costs almost nothing: the canonical record is 20 events, the product has not
started its real deployment (bootstrap task 10.2 — first session with the learner — is unchecked),
and the one schema-breaking change (`add-tiered-content-progression`) has not landed, so this
rename does not compound anything.

## What Changes

- **Event schema**: `modality` field → **`activity`**, with bare activity values `listen` /
  `trace` / `hear-tap` (the `expose-` prefix dies with the old register); a new **`module`** field
  (`learn` / `assess` / `review`) records which module produced the event — information the log
  has never carried.
- **Recognition rule restated in activity words**: recognition evidence = a `hear-tap` activity
  response; exposure activities (`listen`, `trace`) never promote mastery. The structural guard
  the `expose-` prefix provided is subsumed by the taxonomy itself.
- **Storage migration, all three layers**: sync-service SQLite column rename + backfill;
  one-time translation of the canonical `data/events/*.jsonl`; client IndexedDB version bump with
  additive row normalization. Existing events are **translated, never discarded** — the 20
  recorded events may be real play.
- **Adaptivity arm values** follow the new activity ids; the word "arm" itself stays (it names the
  experiment's assignment slot, not the interaction).
- **Spec coordination**: `add-tracing-modality-arm`'s exposure delta (which specifies the
  `expose-*` identifiers and "teaching modality" wording) is amended to the unified vocabulary;
  `adaptivity-instrumentation`'s "modality effectiveness" wording becomes activity effectiveness.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `learner-state`: the event-schema requirement is rewritten — events record `module` and
  `activity` (values `learn`/`assess`/`review` and `listen`/`trace`/`hear-tap`) instead of
  `modality`; the mastery/known-set requirements' evidence rule is restated as recognition
  **activity** evidence.
- `adaptivity-instrumentation`: "modality effectiveness" wording becomes "teaching-activity
  effectiveness"; the collected-comparison requirement and its scenario are reworded, with no
  behavioral change to what is collected or randomized.

## Impact

- **`packages/learner-state`**: `LearnerEvent` type, `REQUIRED_EVENT_FIELDS`, validation,
  `DEFAULT_RECOGNITION_MODALITIES` → `DEFAULT_RECOGNITION_ACTIVITIES` (values unchanged:
  `hear-tap`), mastery/known-set/learner-context doc comments, full test updates.
- **Engines + app**: `exposure-engine` (writes `learn`/`listen`|`trace`), `assessment-engine`
  (`assess`/`hear-tap`), `memory-session` (`review`/`hear-tap`), arm values in assignment records,
  screen props that pass arm ids.
- **`infra/sync-service`**: events-table column rename + backfill (SQLite table rebuild),
  backup/export round-trip, `pull-events` output shape.
- **Data**: one-time translate script for `data/events/events.jsonl`; client IndexedDB
  `DB_VERSION` bump with additive normalization (old rows rewritten in place on upgrade).
- **Specs**: learner-state + adaptivity-instrumentation deltas here; coordination edit to
  `add-tracing-modality-arm`'s exposure delta (task).
- **Not affected**: `add-tiered-content-progression` (its future schema break is independent);
  production deployment (its store holds only verification-stage data — see design).
