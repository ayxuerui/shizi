## 1. Curriculum package — batch composition

- [ ] 1.1 Add optional `pickedInBatch?: ReadonlySet<string>` to `CurriculumState` (`packages/curriculum/src/types.ts`) and enforce it as a hard confusability exclusion in `selectNextCharacter` (`packages/curriculum/src/select.ts`)
- [ ] 1.2 Change `DEFAULT_CURRICULUM_CONFIG.batchSize` from 5 to 6 (`packages/curriculum/src/types.ts`)
- [ ] 1.3 Update `composeBatch` (`packages/curriculum/src/batch.ts`) to accumulate each pick into `pickedInBatch`; update `composeBatchPlan` to clear it at batch boundaries
- [ ] 1.4 Unit tests (`packages/curriculum/src/batch.test.ts`): default batch composes six characters; no mutually confusable pair within a batch; candidate confusable with a picked member is skipped even outside the recent window; constraint holds when batchSize > recentWindowSize − 1; short batch on exhaustion; Phase A boundary span (25 chars → four full batches + one short)

## 2. Assessment engine — focused probing

- [ ] 2.1 Add optional `focusCharacters?: readonly string[]` to `CreateAssessmentSessionOptions` (`packages/assessment-engine/src/session.ts`)
- [ ] 2.2 Restrict frontier-derived informative probe targets to the focus set when present; leave dilution pool (identity set ∪ known-set), forced identity/shaky slots, and whole-pool distractor generation untouched
- [ ] 2.3 Add `"focus-resolved"` session-complete reason when all focused characters are resolved before duration/item bounds; extend the `NextProbeResult` reason union
- [ ] 2.4 Engine tests: informative probes stay inside focus; easy items still appear from broader sources; forced slot may target an out-of-focus identity/shaky character; distractors drawn with full-pool attributes; early completion on focus resolution; sessions without focus behave exactly as before

## 3. Orchestrator and app wiring

- [ ] 3.1 Change the assess variant of `ActivityDecision` to `{ type: "assess"; characters }` and compute unresolved batch members (introduced; mastery not `known`/`shaky`) in `decideActivity` (`apps/assessment/src/session/activity-selector.ts`); guard the empty-unresolved case so a completed batch recomposes forward
- [ ] 3.2 Replace the assess-scope doc comment in `activity-selector.ts` with a pointer to the orchestration spec
- [ ] 3.3 Thread `decision.characters` through `PracticeRouter.tsx` → `BoutScreen.tsx` → `use-assessment-session.ts` → `CreateAssessmentSessionOptions`
- [ ] 3.4 Extend `bout-machine.ts` `completionReason` union with `"focus-resolved"`, mapped to the existing closing beat (no UI branching on reason)
- [ ] 3.5 Orchestrator tests (`apps/assessment/src/session/activity-selector.test.ts`): assess decision carries unresolved batch members; known/shaky members excluded; completed batch advances rotation to next batch's learn; learn/memory decisions unchanged; replay determinism
- [ ] 3.6 App-level test updates: `BoutScreen`/`App` tests for the new props threading and completion reason

## 4. Verification

- [ ] 4.1 Run `npm test`, `npm run typecheck`, and lint across all workspaces; fix regressions
- [ ] 4.2 Dev-stack verification per AGENTS.md: `npx vite build --mode dev` in `apps/assessment` (+ precache check), `docker restart shizi-gateway-dev`, then on `https://shizi-dev.realxco.com/assessment/` confirm a fresh profile learns a six-character batch and the subsequent assess bout probes only those characters (plus familiar easy items) with a normal closing beat
