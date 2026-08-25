## 1. `packages/learner-state`

- [x] 1.1 `types.ts`: `LearnerEvent` gains `module: "learn" | "assess" | "review"`; rename `modality` → `activity` (`"listen" | "trace" | "hear-tap"`); update `REQUIRED_EVENT_FIELDS`
- [x] 1.2 `validation.ts`: validate the new fields (module enum + activity enum); reject the retired `modality` field name
- [x] 1.3 `mastery-projection.ts`: `DEFAULT_RECOGNITION_MODALITIES` → `DEFAULT_RECOGNITION_ACTIVITIES` (`{"hear-tap"}`, values unchanged); config key `recognitionModalities` → `recognitionActivities`; doc comments to activity vocabulary
- [x] 1.4 `learner-context.ts`, `known-set-projection.ts`, `export.ts`, `event-log.ts`: update doc comments and any field references; `export`/`parse` round-trip carries the new shape
- [x] 1.5 Update every test in the package (event factory, validation, mastery, learner-context, export, projection-replay, event-log) to the new schema; mastery assertions byte-identical on translated equivalents

## 2. Engines, adaptivity, app writers

- [x] 2.1 `exposure-engine`: writes `module: "learn"`, `activity: "listen" | "trace"`; arm values become `listen`/`trace`; update its tests
- [x] 2.2 `assessment-engine`: writes `module: "assess"`, `activity: "hear-tap"`; `session.ts`'s module constant renamed; update its tests
- [x] 2.3 `apps/assessment` `memory-session.ts`: writes `module: "review"`, `activity: "hear-tap"`; update its tests
- [x] 2.4 `apps/assessment` screens/props passing arm ids (`TraceExposure`, `ListenExposure`, `use-exposure-session`, `activity-selector`'s doc comments): new activity ids; update screen tests' assertions
- [x] 2.5 `packages/adaptivity`: confirm `Arm` is value-agnostic (type `string`); update test fixtures using `expose-*` values

## 3. Client storage

- [x] 3.1 `apps/assessment/src/offline/db.ts`: `DB_VERSION` bump; additive, `contains`-guarded upgrade rewriting stored events to the new shape (old→new mapping per design decision 4)
- [x] 3.2 Tests through `fake-indexeddb`: prior-version database with `modality` rows upgrades; new writes round-trip; no existing events lost

## 4. Sync service + canonical data

- [x] 4.1 `infra/sync-service/src/db.ts`: events-table rebuild adding `module` + renaming `modality` → `activity`, copy-translated inside a transaction, pre-migration backup step; versioned so it runs once per store
- [x] 4.2 Update insert/read paths, `backup.ts` round-trip, and tests to the new columns
- [x] 4.3 One-time repo-side translate script for `data/events/events.jsonl`: writes `events.jsonl.bak` first, rewrites rows to the new shape (mapping per design decision 4), refuses a second run; run it and commit the translated file + `.bak`
- [x] 4.4 `pull-events.ts` output verified against the new shape; `SHIZI_ENV` guard untouched

## 5. Spec coordination

- [x] 5.1 Amend `add-tracing-modality-arm`'s exposure delta: "teaching modality" → "teaching activity"; the `expose-listen`/`expose-trace` identifier requirement restated as `module: "learn"` + activity values; its design's identifier-guard decision pointed at this change's decision 2
- [x] 5.2 Hand-edit `openspec/specs/adaptivity-instrumentation/spec.md`'s Purpose: "learning modality effectiveness" → "teaching-activity effectiveness" (a delta cannot change a Purpose)
- [x] 5.3 Verify exactly one definition of the event schema across `openspec/` — this change owns it; the layered change's learner-state delta and indicator change reference, not redefine

## 6. Verification

- [x] 6.1 Workspace `npm test`, `typecheck`, `lint` all pass; mastery-projection tests demonstrate identical transitions on translated old-shape data
- [x] 6.2 Ship dev per `AGENTS.md` (sync-service rebuilt + both stacks restarted); play one bout per module on dev in a real browser; confirm events sync with `module`/`activity`, backup round-trips, and `pull-events` emits the new shape
- [x] 6.3 Confirm the canonical `data/events/events.jsonl` + `.bak` are consistent (row counts equal, all rows carry `module`/`activity`)
- [x] 6.4 `openspec validate --all --strict`
