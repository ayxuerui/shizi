## Why

Today shizi can only ever teach one thing: individual characters. Every core package is hardcoded to a flat `character: string` namespace, and `curriculum`'s `wordUnlockScore()` / `storyUnlockScore()` are stubs that return `0` for every candidate — the sequencer literally cannot see past the 字 tier. But recognising 字 in isolation is not reading. Eliana already owns sound↔meaning for spoken Chinese; the payoff of knowing 山 and 羊 is being able to read 山羊, and the payoff of knowing 词 is reading a 句. Without the upper tiers there is no path from "recognises 200 glyphs" to "reads".

This change makes the 字 → 词 → 句 ladder the project's explicit learning sequence, where each tier's content is derived from what the learner already knows at the tier below.

## What Changes

- **Introduce a tiered content model.** A generic content unit carries a `kind` discriminant (`character` | `word` | `sentence`) plus an id, replacing the bare `character: string` used across `character-data`, `curriculum`, `learner-state`, `assessment`, and `content-validator`. One selection/mastery engine serves all three tiers instead of three parallel implementations.
- **Define the derivation rule as a spec-level invariant.** A 词 is only eligible once every 字 composing it is in the learner's known set; a 句 is only eligible once every 词 composing it is known. Eligibility is computed from the learner's own event-sourced state, not from a fixed syllabus — so the ladder advances at her pace.
- **Add the 词 tier from CC-CEDICT.** The dictionary is already licence-cleared in `data/PROVENANCE.md` (CC BY-SA 3.0) but has never been integrated. This change integrates it, filtered to words composed solely of pool characters and age-appropriate for a 4-year-old.
- **Add the 句 tier via offline LLM generation.** Sentences are generated **repo-side, at authoring time**, by a batch script calling the Claude API; every candidate is gated through `content-validator` and then human-reviewed before it is committed as static data. The child's app performs **no runtime LLM calls** — it stays a fully offline PWA, and no unreviewed generated text ever reaches her.
- **Replace the two dead scoring stubs.** `wordUnlockScore()` and `storyUnlockScore()` become real: a character's score now reflects how many 词 (and transitively 句) learning it would unlock.
- **BREAKING — learner event schema.** `LearnerEvent.character` becomes a kind-qualified content reference. The committed `data/events/events.jsonl` and the sync-service event store need a migration; without one, existing 字 events would collide with 词/句 events in the same flat namespace.
- **Discharge the CC-CEDICT attribution obligation.** `data/PROVENANCE.md` already flags a `data/ATTRIBUTIONS.md` action item as outstanding; first use of the data triggers it.

## Capabilities

### New Capabilities
- `content-model`: The generic tiered content unit — kind discriminant, content identity, the tier ordering (字 → 词 → 句), and the prerequisite/derivation contract that makes a tier's eligibility a function of the known set one tier below.
- `word-data`: The 词 candidate pool — CC-CEDICT integration, composition filter against the character pool, age-appropriateness curation, per-word attributes (gloss, pinyin, component characters, frequency), and word-level confusability.
- `sentence-data`: The 句 bank — offline generation pipeline, the validation and human-review gate every sentence must pass, per-sentence attributes (component words, length, frame), and provenance for generated content.

### Modified Capabilities
- `curriculum`: Sequencing becomes tier-aware — selects the next unit across all three tiers rather than only characters, and the word-unlock / story-unlock scoring factors gain real backing instead of returning `0`.
- `learner-state`: Event schema and the known-set / mastery projections become kind-qualified rather than character-keyed, so mastery is tracked independently per tier. **BREAKING** to the event schema.
- `assessment`: Probing extends beyond single characters to 词 and 句, with tier-appropriate difficulty and distractor selection (visual stroke-shape confusability does not generalise above the 字 tier).
- `content-validator`: Validation gains word- and sentence-granularity checks, and becomes the gate the 句 generation pipeline runs against — today it only inspects raw text at Han-character granularity.
- `character-data`: Adopts the generic content-unit types as the 字-tier implementation, and exposes the character→word participation data the word-unlock score needs.

## Impact

- **Packages**: `content-model` (new), `word-data` (new), `sentence-data` (new); breaking type changes across `character-data`, `curriculum`, `learner-state`, `assessment-engine`, `validator`.
- **App**: `apps/assessment` — probe presentation and response handling for multi-character units; layout and narration for 词/句 rather than a single glyph.
- **Data**: new CC-CEDICT-derived word pool and reviewed sentence bank under `data/`; `data/ATTRIBUTIONS.md` created; `data/events/events.jsonl` migrated to the kind-qualified schema.
- **Infra**: `infra/sync-service` SQLite event store migrated in step with the event schema.
- **Dependencies**: `@anthropic-ai/sdk` added as a repo-side dev/tooling dependency only — never shipped to the app bundle.
- **Sequencing risk**: `bootstrap-shizi-assessment` is at 58/67 tasks and `add-tracing-modality-arm` at 0/28. This change rewrites types those changes are still landing against, so it should not start until bootstrap's remaining tasks are closed — otherwise both changes are editing the same type surface concurrently.
