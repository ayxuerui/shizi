## 1. Curriculum package — batch composition

- [x] 1.1 Add optional `pickedInBatch?: ReadonlySet<string>` to `CurriculumState` (`packages/curriculum/src/types.ts`) and enforce it as a hard confusability exclusion in `selectNextCharacter` (`packages/curriculum/src/select.ts`)
- [x] 1.2 Change `DEFAULT_CURRICULUM_CONFIG.batchSize` from 5 to 6 (`packages/curriculum/src/types.ts`)
- [x] 1.3 Update `composeBatch` (`packages/curriculum/src/batch.ts`) to accumulate each pick into `pickedInBatch`; update `composeBatchPlan` to clear it at batch boundaries
- [x] 1.4 Unit tests (`packages/curriculum/src/batch.test.ts`): default batch composes six characters; no mutually confusable pair within a batch; candidate confusable with a picked member is skipped even outside the recent window; constraint holds when batchSize > recentWindowSize − 1; short batch on exhaustion; Phase A boundary span (25 chars → four full batches + one short)

## 2. Assessment engine — focused probing

- [x] 2.1 Add optional `focusCharacters?: readonly string[]` to `CreateAssessmentSessionOptions` (`packages/assessment-engine/src/session.ts`)
- [x] 2.2 Restrict frontier-derived informative probe targets to the focus set when present; leave dilution pool (identity set ∪ known-set), forced identity/shaky slots, and whole-pool distractor generation untouched
- [x] 2.3 Add `"focus-resolved"` session-complete reason when all focused characters are resolved before duration/item bounds; extend the `NextProbeResult` reason union
- [x] 2.4 Engine tests: informative probes stay inside focus; easy items still appear from broader sources; forced slot may target an out-of-focus identity/shaky character; distractors drawn with full-pool attributes; early completion on focus resolution; sessions without focus behave exactly as before

## 3. Orchestrator and app wiring

- [x] 3.1 Change the assess variant of `ActivityDecision` to `{ type: "assess"; characters }` and compute unresolved batch members (introduced; mastery not `known`/`shaky`) in `decideActivity` (`apps/assessment/src/session/activity-selector.ts`); guard the empty-unresolved case so a completed batch recomposes forward
- [x] 3.2 Replace the assess-scope doc comment in `activity-selector.ts` with a pointer to the `learning-orchestration` spec
- [x] 3.3 Thread `decision.characters` through `PracticeRouter.tsx` → `BoutScreen.tsx` → `use-assessment-session.ts` → `CreateAssessmentSessionOptions`
- [x] 3.4 Extend `bout-machine.ts` `completionReason` union with `"focus-resolved"`, mapped to the existing closing beat (no UI branching on reason)
- [x] 3.5 Orchestrator tests (`apps/assessment/src/session/activity-selector.test.ts`): assess decision carries unresolved batch members; known/shaky members excluded; completed batch advances rotation to next batch's learn; learn/memory decisions unchanged; replay determinism
- [x] 3.6 App-level test updates: `BoutScreen`/`App` tests for the new props threading and completion reason

## 4. Verification

- [x] 4.1 Run `npm test`, `npm run typecheck`, and lint across all workspaces; fix regressions
- [x] 4.2 Dev-stack verification per AGENTS.md: `npx vite build --mode dev` in `apps/assessment` (+ precache check), `docker restart shizi-gateway-dev`, then on `https://shizi-dev.realxco.com/assessment/` confirm a fresh profile learns a six-character batch and the subsequent assess bout probes only those characters (plus familiar easy items) with a normal closing beat — verified via chrome-devtools MCP against an isolated browser context. Unlock screen showed the DEV badge; a fresh profile started on the listen exposure arm. The trace arm requires real hanzi-writer stroke gestures no tap-based automation can drive, so the remaining 5 of the 6-character batch (我你他是有不) were introduced via directly-seeded IndexedDB `learn`/`listen` events, identical in shape to what completing that UI produces — the trace-arm interaction itself is `add-tracing-modality-arm`'s own device-check concern (task 8.3), not this change's. With the batch introduced, the app correctly moved to an assess bout; inspecting the written events by `positionInSession` confirmed genuine frontier-informative probes (slots 9, 14, 24) targeted only batch members (不/是/有), forced identity/shaky slots (4, 19) and every easy/dilution slot drew from the identity set unrestricted by focus, distractor options included out-of-batch characters, and the bout reached its normal closing beat (via the duration bound, not item-count or focus-resolved — UI identical either way, confirming no branching on completion reason). A further bout correctly resumed on the same unresolved batch. No console errors beyond the expected `config.json` 404.
