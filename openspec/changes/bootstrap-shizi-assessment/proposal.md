## Why

Eliana (薛亦霖 / 小蓝莓, age 4, heritage Mandarin speaker) already owns sound↔meaning for spoken Chinese; the only missing link is character *form* recognition (识字). No existing tool discovers her actual known-character set (parents cannot reliably enumerate it), sequences new characters against her specific starting point, or adapts to her over time. This change builds the foundational data core and the first thing she touches: an iPad assessment game that discovers what she knows via frontier search rather than enumeration, and that seeds every downstream capability (printed reader, tablet games, adaptive routing) with real data instead of a guess.

## What Changes

- Establish an **event-sourced learner state** store (append-only log + recomputable projections) as the canonical source of truth, with a repo-side JSONL export as the durable record and offline-first sync from the iPad.
- Assemble a **character data core**: a hand-curated ~200-character candidate pool (identity set: 薛亦霖/小蓝莓 as non-productive logos; productive set for everything else), enriched with frequency, hand-tagged concreteness/pictographic flags, stroke-order path data (Make Me a Hanzi), and confusability relationships.
- Build a **curriculum sequencer**: a fixed 25-character Phase A (grammar skeleton + identity + basic pictographs, since scoring cannot bootstrap at K≈0) followed by a greedy Phase B scoring function (word-unlock, story-unlock, personal relevance, learnability, confusability penalty).
- Build a **whitelist validator** for any generated/authored text against a learner's known ∪ identity ∪ new-target set, with repetition-threshold and new-character-density rules (used by this and all future content-authoring changes).
- Build the **assessment game**: a hear→tap PWA on iPad Air (Apple Pencil + finger input), framed as "help 悟空 find the way" (no scores, no failure state), performing adaptive frontier search over the candidate pool with 2-hit confirmation, latency-based guess detection, and 4:1 easy-item dilution to hold felt success at 80–85%.
- Implement **Loop 4 (difficulty calibration)** live from day one: distractor confusability tuned to a rolling accuracy target.
- Instrument **all five adaptive loops** from first use even though only Loops 1/2/4/5 are live in this change — Loop 3 (modality routing) requires a matched-pair randomization protocol and event schema in place now so month-3 inference has clean data, without running any modality-comparison logic yet.
- Stand up **offline-first PWA infrastructure**: static hosting, service worker precache, IndexedDB event queue, Cloudflare Worker + D1 sync endpoint, repo-side config publishing.

Out of scope for this change (follow-on changes): the printed reader and episode generation (needs the validator + curriculum from this change as inputs), additional game modality arms (tracing, 词-context, etymology reveal), the 西游记 progression/collection wrapper, family-voice audio recording, and Loop 3 inference itself. Handwriting production and component-decomposition teaching are deferred by design to ~age 5–6, not built here.

## Capabilities

### New Capabilities
- `learner-state`: event log schema, projections (known-set, mastery/Leitner state, difficulty parameters), offline sync, canonical repo-side JSONL export.
- `character-data`: candidate pool assembly, identity-vs-productive split, hand-tagged concreteness/pictographic attributes, stroke-path integration, confusability computation.
- `curriculum`: Phase A fixed sequence, Phase B greedy scoring function, confusability spacing constraint.
- `content-validator`: whitelist/repetition/density validation rules for any text against a learner's character state (consumed by this change's nothing directly yet, but specified now since curriculum and assessment both depend on its rules for confusability spacing and future reuse).
- `assessment`: iPad PWA hear→tap game, frontier-search algorithm, guess-control (2-hit + latency), 悟空-framing/no-failure-state UX, Loop 4 difficulty calibration.
- `adaptivity-instrumentation`: event schema for all five loops, matched-pair randomization assignment protocol, one-tap parent rating capture — logging and assignment only, no inference logic.

### Modified Capabilities
(none — greenfield project, no existing specs)

## Impact

- **New repo structure**: `apps/assessment` (PWA), `packages/character-data`, `packages/curriculum`, `packages/validator`, `packages/learner-state`, `infra/` (Cloudflare Worker + D1), `data/` (candidate pool, event JSONL exports).
- **External dependencies**: Make Me a Hanzi (stroke paths — license verification required in Phase 0), LXGW WenKai (font — license verification required), CC-CEDICT (glosses), Cloudflare Pages/Workers/D1 (hosting).
- **Manual input required from the parent**: hand-tagging ~200 candidates for concreteness/pictographic flags (~20 min); confirming identity-set characters (薛亦霖, 小蓝莓).
- **No impact on 悟空识字** — it continues to run in parallel; this change does not replace it.
