## Context

The batch composer exists (`composeBatch`, `packages/curriculum/src/batch.ts`) and only `learn` consumes it. The assess module deliberately ignores the batch today (`apps/assessment/src/session/activity-selector.ts:16–28` documents why: dilution draws from the entire known-set and distractor generation indexes the whole pool), and no spec describes the rotation. See proposal.md for motivation; the delta specs define the target behavior.

A relevant mathematical fact shapes Decision 1: with `recentWindowSize = 5`, the sliding-window spacing check already covers all intra-batch pairs for batch sizes ≤ 6 (pick *k* sees up to 5 predecessors). The guarantee is real but **incidental** — it evaporates silently at batch size 7, which is why an explicit constraint is still warranted.

## Goals / Non-Goals

**Goals:**
- Make intra-batch non-confusability an explicit composition constraint, independent of window size
- Default batch size 6
- Assessment engine accepts a per-session focused character set without disturbing dilution, forced slots, or distractor sourcing
- Rotation decisions carry character lists for every module; document the contract in the new `learning-orchestration` spec

**Non-Goals:**
- No parent batch-review gate, frozen-batch persistence, published-plan consumption, or package extraction (`add-batched-curriculum-tagging` §2–9 / layered architecture own those)
- No change to memory-review semantics, mastery projection, or the event schema

## Decisions

**1. Explicit intra-batch constraint via a new field on `CurriculumState`, not a `selectNextCharacter` signature change.**
Add an optional `pickedInBatch?: ReadonlySet<string>` to `CurriculumState`. `selectNextCharacter` treats candidates confusable with any picked member as ineligible (hard constraint, same "decline rather than violate" ethos as spacing). `composeBatch` accumulates picks into it alongside the simulated known-set. Rationale: keeps the single-selection-primitive pattern (batch.ts doc comment) without widening the function signature; existing callers that omit the field are unaffected. Alternative rejected: reimplementing a scoring loop inside `composeBatch` would duplicate ranking logic.

**2. Default `batchSize` 5 → 6 in `DEFAULT_CURRICULUM_CONFIG`; leave `recentWindowSize` at 5.**
The two knobs decouple by virtue of Decision 1. Phase A (25 chars) becomes 4 full batches plus one short batch — boundary-spanning tests must cover this. The publish script's flat `nextTargets` output is unread by the app, so no consumer migration is needed.

**3. Focused set passed at session construction, mirroring `MemorySession`'s `dueCharacters` precedent.**
`CreateAssessmentSessionOptions` gains optional `focusCharacters?: readonly string[]`. Inside the engine: frontier-search candidate filtering applies to informative-probe derivation; the felt-difficulty dilution pool (identity set ∪ known-set), the every-3rd-slot identity/`shaky` forcing, and whole-pool distractor lookups are untouched. Config-level (rather than constructor-level) placement was rejected because focus is per-session orchestrator input, exactly like memory's due-list, not a durable difficulty parameter.

**4. New completion reason `focus-resolved`.**
When all focused characters reach resolved outcomes before duration/item bounds, `nextProbe()` returns `session-complete` with reason `"focus-resolved"`. This extends two unions: `NextProbeResult`'s reason and `bout-machine.ts`'s `completionReason`. The closing beat stays identical regardless of reason (per spec scenario), so UI copy does not branch on it.

**5. `ActivityDecision` assess variant becomes `{ type: "assess"; characters: readonly string[] }`.**
`decideActivity()` computes unresolved batch members (introduced, mastery not `known`/`shaky`) and returns them. Guard: if that list is empty while the batch was fully introduced, fall through to treating the batch as complete — recomposition against the updated known-set naturally yields the next batch (whose unintroduced members route back to `learn`). `PracticeRouter` forwards the list through `BoutScreen` into `use-assessment-session` → `CreateAssessmentSessionOptions`. The long doc comment in `activity-selector.ts` shrinks to a pointer at the `learning-orchestration` spec.

## Risks / Trade-offs

- [Focused bouts measure fewer distinct characters, slowing confirmation of older `shaky` characters] → Mitigation: forced identity/`shaky` slots are retained by Decision 3, and the daily memory bout continues covering stale knowns; revisit if rolling accuracy band drifts.
- [`focus-resolved` union extension ripples into reducers/tests] → Mitigation: single new enum member, mapped to the existing closing beat; covered by bout-machine and engine tests.
- [Curriculum delta collides with the un-archived `add-batched-curriculum-tagging` delta, which also adds batch requirements (default size 5)] → Mitigation: this change supersedes the size-default and constraint wording; reconcile both deltas at whichever archive happens second.
- [`add-layered-learning-architecture` also targets a `learning-orchestration` capability (its "Learning Layer"), with its own near-duplicate module-selection requirements] → Mitigation: this change's new capability is deliberately named `learning-orchestration` (not `orchestration`) so there is exactly one orchestration capability, not two. This change's requirements (batch binding, learn-before-assess, assess/memory scoping, determinism) land first via `ADDED Requirements`; `add-layered-learning-architecture`'s delta should target the same capability with its own `ADDED`/`MODIFIED` operations (context/goal/queue-driven selection, the terminal state, outcome reporting) rather than re-declaring the capability. Reconcile wording overlap (e.g. "Learn precedes assessment per batch member" vs. "Introduction precedes measurement for a goal") at whichever change archives second.
- [Larger batches slightly delay per-character first exposure within Phase A] → Mitigation: accepted trade-off of the requested batch size; short-batch behavior bounds worst case.

## Migration Plan

No data or event-schema migration; no persistence changes. Single coordinated workspace build (packages + app); rollback is reverting the implementation commit. Verification follows AGENTS.md: `npx vite build --mode dev` in `apps/assessment`, `docker restart shizi-gateway-dev`, then exercise learn → assess on `https://shizi-dev.realxco.com/assessment/` confirming assess probes draw from the visible batch and bouts close normally.

## Open Questions

None — scope decisions (assess scoping model, batch size handling, memory semantics) were settled with the user during planning.
