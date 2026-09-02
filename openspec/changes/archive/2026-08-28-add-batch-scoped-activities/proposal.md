## Why

The curriculum already composes batches of characters (`composeBatch`), but only the `learn` activity actually operates on the active batch. The `assess` activity probes adaptively across the entire pool, and the `memory` activity reviews stale characters from outside the batch — so each module draws from a different scope and there is no spec describing this rotation at all. Making every module's activity operate on one shared active batch gives each learning cycle a consistent, predictable character set (e.g., "a batch of 6 characters is learned, then assessed"), which is what we want the daily rotation to feel like.

## What Changes

- Raise the default batch size to **6** and make intra-batch non-confusability an **explicit constraint** in `composeBatch` (pairwise check against already-picked members) instead of relying on `recentWindowSize == batchSize`.
- Scope assessment bouts to the active batch: when the orchestrator supplies a focused character set, informative probes draw only from those characters; easy-item dilution (identity set ∪ known-set) and whole-pool distractor generation are unchanged.
- The orchestrator's `assess` decision now carries the active batch's introduced-but-not-yet-known characters through to the assessment session.
- Document the full per-batch rotation contract (learn → assess → memory scoping rules) in a new `learning-orchestration` capability spec — previously this decision existed only as undocumented code.
- Memory review semantics unchanged: stale known characters outside the active batch, stalest-first, capped — now specified.

## Capabilities

### New Capabilities

- `learning-orchestration`: the module-rotation contract that binds every module decision (`learn` / `assess` / `memory`) to the single active curriculum batch, including how each module scopes its character set and how the decision recomputes deterministically from event history after each activity. Named to match the capability `add-layered-learning-architecture` also targets (see that change's "Learning Layer" `learning-orchestration` capability) — one capability name, added to incrementally, rather than two parallel orchestration specs; see this change's design.md for the reconciliation note.

### Modified Capabilities

- `curriculum`: batch composition requirements change — default batch size becomes 6, and non-confusability within a batch becomes an explicit pairwise composition constraint independent of the recent-window size.
- `assessment`: when an orchestrator supplies a focused character set, informative probes are restricted to it while dilution/easy probes and distractor generation keep their broader sources; bout completion gains a focused-set-resolved condition.

## Impact

- `packages/curriculum` (`batch.ts`, `types.ts`): explicit intra-batch constraint; default `batchSize` 5 → 6. Downstream consumers of `composeBatch`/`composeBatchPlan` (publish script parity) see larger batches by default; config remains overridable.
- `packages/assessment-engine` (`session.ts`, `types.ts`): new optional focused-probe-set option on `CreateAssessmentSessionOptions`; frontier candidate filtering; completion semantics. Backward compatible (option is optional).
- `apps/assessment/src/session/activity-selector.ts`: assess decision carries `characters`; doc comment updated to point at the new `learning-orchestration` spec.
- `apps/assessment/src/session/PracticeRouter.tsx`, `src/bout/BoutScreen.tsx`: thread batch characters into the assessment session.
- No event schema changes; no persistence changes; no published-config format changes.

Non-goals: parent batch-review gate, frozen-batch persistence across relaunch, published-plan consumption, and the `learning-orchestration` package extraction remain owned by the open `add-batched-curriculum-tagging` (§2–9) and `add-layered-learning-architecture` changes.
