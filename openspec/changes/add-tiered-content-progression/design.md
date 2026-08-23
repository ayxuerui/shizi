## Context

See proposal.md — Why. The design-relevant constraints:

- Every core package types its subject as a bare `character: string`. `CurriculumState.knownSet` is a `ReadonlySet<string>`, `LearnerEvent.character` is a `string`, and `computeMasteryStates()` groups events into a `Map<string, LearnerEvent[]>` keyed on that field. There is one flat namespace and no kind discriminant anywhere.
- The event log is the **sole source of truth** (`learner-state` spec: "Event log is append-only and canonical"), and it already contains real events from Eliana's sessions in `data/events/events.jsonl` plus the sync-service SQLite store. Any schema change has to migrate live data, not just types.
- `curriculum`'s `wordUnlockScore()` and `storyUnlockScore()` in `packages/curriculum/src/scoring.ts` return `0` unconditionally. They are declared in `ScoringWeights` and wired into `scoreCandidate()`, so the seams exist — they are unfed, not absent.
- CC-CEDICT is licence-cleared in `data/PROVENANCE.md` (CC BY-SA 3.0, verdict GO) but never integrated; that file already flags a `data/ATTRIBUTIONS.md` action item as outstanding.
- `apps/assessment` is an offline-capable PWA used by a 4-year-old on iPad. Offline operation is a spec requirement (`assessment`: "Full offline operation"), which rules out runtime network calls for content.
- `character-data`'s confusability is geometric — stroke-shape similarity between single glyphs (`packages/character-data/src/confusability.ts`). It has no meaningful analogue above the character tier.

## Goals / Non-Goals

**Goals:**

- One selection/mastery engine that serves all three tiers, rather than three parallel implementations that drift.
- Make tier eligibility a pure function of the learner's projected known set, so the ladder needs no hand-maintained ordering.
- Migrate the existing event log without losing or duplicating a single event.
- Keep the learner-facing app fully offline and free of any model-service dependency.

**Non-Goals:**

- Teaching activities beyond probing. This change extends *what* can be probed and sequenced; the tracing/exposure modality work is `add-tracing-modality-arm`'s scope.
- A fourth tier (paragraphs, stories, the `printed-reader` idea named in bootstrap). The tier ordering is fixed at three.
- Runtime/on-device generation of any kind.
- Grammar correctness checking of generated sentences beyond what a human reviewer catches. We are not building a Chinese grammar validator.

## Decisions

### 1. A new `@shizi/content-model` package owns the shared abstraction

`ContentUnit` is a discriminated union on `kind`, with the tier ordering and the eligibility predicate defined once:

```ts
export type Tier = "character" | "word" | "sentence";
export type ContentRef =
  | { kind: "character"; id: string }
  | { kind: "word"; id: string }
  | { kind: "sentence"; id: string };
```

**Why a new package rather than putting this in `character-data`:** dependency direction. `word-data` needs the abstraction *and* the character pool; `character-data` needs the abstraction but must not depend on `word-data`. A shared leaf package gives `content-model ← character-data ← word-data ← sentence-data` with no cycle. Putting the types in `character-data` would force `character-data` to import word types for the participation query, creating exactly the cycle we want to avoid.

**Alternative rejected — sibling packages per tier with no shared abstraction** (`word-curriculum` mirroring `curriculum`): duplicates the scoring, spacing, and mastery-projection logic three times. The spacing constraint and the two-consecutive-correct promotion rule are identical in shape at every tier; only the confusability and difficulty measures differ, and those are already injectable.

### 2. Per-tier measures are injected, not branched

`curriculum` and `assessment-engine` stay tier-agnostic; each tier supplies a `TierMeasures` record providing its difficulty function and confusability relation. This follows the existing `SessionDeps` injection pattern in `packages/assessment-engine/src/session.ts` rather than introducing `switch (kind)` blocks through the selection code.

- **Character difficulty** — unchanged: stroke count + frequency rank (`packages/character-data/src/difficulty.ts` logic, as used by `assessment-engine`).
- **Word difficulty** — component count, max component-character difficulty, and word frequency. A two-character word of easy characters is easier than a two-character word containing a hard one, so max (not mean) over components is the right aggregate.
- **Sentence difficulty** — word count and max component-word difficulty, same reasoning one tier up.
- **Word confusability** — shares a component character in the same position, or near-identical pinyin. Explicitly **not** a lookup of component stroke-shape confusability: 山羊 and 山洞 are confusable because they share 山, not because 羊 and 洞 look alike.
- **Sentence confusability** — not defined. Sentences are long enough that same-tier distractor discrimination is not shape-driven; the spec requires same-tier distractors of comparable length, which is satisfiable without a similarity measure. Spacing at the sentence tier falls back to "not the same sentence."

### 3. Event schema: `character: string` → `unit: ContentRef`

The event's item reference becomes a nested kind-qualified object. **Rejected alternative — a compound string key** (`"char:山"` / `"word:山羊"`): it keeps the field a `string` and so migrates more cheaply, but it makes every consumer parse a delimiter, and it silently breaks the moment a unit id contains the delimiter. A nested object is self-describing in the JSONL export a human is meant to inspect.

`priorExposureCount` and `daysSinceLastExposure` are already per-item; they become per-`unit`, which the spec's "same text at two tiers does not collide" scenario requires.

### 4. Migration is a replay, not an in-place edit

The append-only guarantee forbids mutating events, but it does not forbid rewriting the log's *encoding*. The migration reads `data/events/events.jsonl`, maps each record to the new shape with `unit: {kind: "character", id: <old character>}`, and writes a new file — preserving every event `id`, so it is idempotent and re-runnable. The sync-service SQLite store gets the equivalent schema migration.

Ordering matters: the store and the client must not disagree about the schema mid-flight. Because there is exactly one learner and one device, we take the simple path — quiesce (no session in progress), back up, migrate store and export together, deploy the new client — rather than building a dual-read compatibility shim that would exist to serve a single-user cutover.

### 5. CC-CEDICT: vendor a derived subset, don't fetch at build time

The pipeline filters CC-CEDICT down to words composed solely of pool characters, then commits that derived subset with its glosses and pinyin. **Why vendored:** the repo stays self-contained and buildable offline, the pool is reviewable in version control, and we redistribute a small derived subset rather than the whole dictionary. The share-alike obligation is discharged by creating `data/ATTRIBUTIONS.md` **in the same change that first uses the data** — this is a licence condition, not a cleanup task, so it is sequenced before the derived data is consumed.

Curation is two-stage: mechanical composition filter (automatable, re-derivable) then human age-appropriateness review (recorded as an exclusion list, so re-deriving the pool does not discard editorial judgment). This mirrors how `packages/character-data` already separates `pool-membership.ts` from `exclusion.ts`.

### 6. Sentence generation: repo-side batch script, structured output, validator gate

A script under `infra/` (not `apps/`, so it cannot be bundled into the PWA) calls the Claude API with `@anthropic-ai/sdk` as a **devDependency**:

- **Model** `claude-opus-5` with adaptive thinking. Sentence quality for a 4-year-old learning to read is a judgment task, and the volume is small enough that model cost is not the binding constraint.
- **Batch API** (`client.messages.batches.create`) — generation is entirely non-latency-sensitive and batching is half price. Results come back keyed by `custom_id` in arbitrary order.
- **Structured outputs** (`output_config.format`) so each candidate arrives with its text *and* its intended component word list, rather than requiring us to segment free text. We then **verify** that segmentation against the word pool by maximum matching; a mismatch rejects the candidate. Asking the generator to declare its components and checking the claim is more robust than segmenting Chinese text ourselves and hoping our segmenter agrees.
- Every candidate then goes through `@shizi/validator` against the target learner state. Hard failures are discarded automatically and logged (so a systematically bad prompt is visible as a rejection rate, not silence).
- Survivors land in a review file; a human marks approvals, and only approved sentences are committed to the bank. Provenance (model id, run, learner-state assumption) is recorded per sentence.

**Rejected alternative — template/grammar frames:** deterministic and trivially valid, but at this pool size the output is visibly repetitive, and repetitiveness is the specific failure mode that loses a 4-year-old's engagement.

### 7. Consolidation gate prevents thrash between tiers

A newly eligible word should not immediately pull the sequencer off character work. A configured minimum number of eligible units at a tier before that tier is drawn from (spec: "Consolidation before advancement") is a cheap, legible rule; the alternative — a continuous score blending tier depth — has more knobs and no clear win at one-learner scale.

### 8. Latency thresholds become per-tier

A 3-word sentence takes longer to read aloud than a single glyph, so a single global guess-detection threshold would classify every correct sentence response as a slow one and never promote it to `known`. Thresholds move into per-tier config.

## Risks / Trade-offs

- **Migrating the sole source of truth** → Back up `data/events/events.jsonl` and the SQLite store before migrating; assert post-migration that event count and the set of event ids are identical to pre-migration; keep the migration a pure re-encode so it can be re-run. Do not migrate with a session in progress.
- **Type changes ripple through two in-flight changes** (`bootstrap-shizi-assessment` at 58/67, `add-tracing-modality-arm` at 0/28) → Do not start until bootstrap's remaining tasks land. `add-tracing-modality-arm` also touches `learner-state`'s event schema; whichever lands second must rebase onto the other rather than both editing the schema concurrently.
- **Too few eligible words early on** → With ~203 pool characters and a known set that starts near zero, the word tier may stay empty for a long time. This is correct behavior, not a bug, but it should be measured against the real pool before building the sentence tier — if almost no words are ever composable from pool characters, the pool needs widening first. Verification below checks this explicitly.
- **Generated content reaching a child** → Three independent gates: mechanical validation, human approval, and no runtime generation path in the app at all. The third is the one that holds even if the first two are misconfigured.
- **CC-CEDICT glosses are written for adult learners** → Dictionary glosses will often be unsuitable as-is for a 4-year-old. Expect to rewrite glosses during age-appropriateness review; budget for it rather than assuming the dictionary's text ships.
- **Word confusability is a heuristic** → Shared-component-plus-pinyin is a guess at what confuses a preschooler, not a validated measure. It is injected per tier, so it can be replaced without touching selection logic.

## Migration Plan

1. Land `content-model`; migrate `character-data` onto it with `kind: "character"` (no behavior change, types only).
2. Create `data/ATTRIBUTIONS.md` discharging CC-CEDICT's attribution and share-alike obligations. Blocks step 3.
3. Derive and commit the word pool; add the character→word participation query.
4. Migrate the event schema: back up, re-encode `events.jsonl`, migrate the SQLite store, update `learner-state` projections to be per-tier. Verify id-set equality.
5. Make `curriculum` tier-aware; feed the word-unlock score from real participation data.
6. Extend `validator` with word-level checks and an explicit target tier.
7. Build the sentence generation pipeline; generate, validate, review, and commit the first sentence bank.
8. Extend `assessment-engine` and `apps/assessment` for multi-character probes and tier-appropriate distractors.

**Rollback:** steps 1–3 and 5–8 are ordinary code changes, revertable by git. Step 4 is the only one with a data component; rollback is restoring the pre-migration backup of `events.jsonl` and the SQLite store, which is why it is a discrete step with its own verification.

## Open Questions

- The concrete per-tier latency thresholds and the consolidation minimum. These are calibration values, not structural decisions — the config seams exist either way, and the right numbers come from watching real sessions (the existing Loop-4 difficulty calibration does the same thing for the character tier).
- The tier-emphasis weights in scoring. Same reasoning: configurable by construction, tunable after the first bouts that actually reach the word tier.
