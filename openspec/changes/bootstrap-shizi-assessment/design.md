## Context

Greenfield project (see proposal.md - Why). Single learner (age 4), single primary device (iPad Air, Apple Pencil available), single primary developer with 10+ hrs/week. No existing code, no existing specs. The learner cannot self-direct software use; a parent is present for essentially all sessions. 悟空识字 continues running in parallel and is not being replaced.

Two hard constraints shape every decision below:
- **Offline-first is mandatory, not a nicety.** A 4-year-old must never see a loading failure or a broken interaction because the iPad lost WiFi.
- **Adaptation must not outrun data.** At most adaptive-loop combinations, early sample sizes (n≈15-50) cannot support model-fitting without learning noise. See "Fast loops / slow loops" below.

## Goals / Non-Goals

**Goals:**
- Ship a working iPad assessment game the learner actually uses, producing real known-set data.
- Stand up the character data core and curriculum sequencer that all future content depends on.
- Build the validator now, even though no content-authoring pipeline consumes it yet, so its contract is fixed before the printed-reader change is designed.
- Instrument all five adaptive loops' data needs from the first session, even though only Loops 1, 2, 4, and 5 have live logic in this change.
- De-risk the two technically uncertain areas (CJK stroke-animation rendering quality, and later PDF typesetting) before committing further engineering time.

**Non-Goals (deferred to follow-on changes):**
- Printed reader / episode generation (`printed-reader` change) — needs this change's validator and curriculum as inputs.
- Additional game modalities: tracing, 词-context, etymology reveal (`modality-arms` change) — needed before Loop 3 has arms to route between.
- 西游记 progression/collection wrapper, family-voice audio recording (`progression-and-voices` change).
- Loop 3 (modality-effectiveness) inference itself (`adaptive-inference` change, month 3+).
- Handwriting production and character-component-decomposition teaching — deferred by design to ~age 5-6, not merely to a later change.

## Decisions

### Architecture overview

```
  iPad PWA (TypeScript, offline-first)
    │  events (client UUID) queued in IndexedDB, flushed opportunistically
    ▼
  Cloudflare Worker  ──append──▶  D1 (hosted event store)
    ▲
    │  config.json (known-set, next targets, probe pool, difficulty params)
    │  published by a repo-side build/export step
  Repo (git): candidate pool, curriculum weights, validator rules,
              exported event JSONL (durable canonical record)
```

D1 is the durable-enough hosted store for day-to-day sync; the repo-side JSONL export (via a pull script) is the actual canonical, versioned record referenced by `learner-state`'s "durable repo-side export" requirement. This two-tier arrangement exists so that losing the hosted database is an inconvenience, not data loss.

### Fast loops (client) vs. slow loops (repo), and why they must not merge

| | Fast (in-session) | Slow (between sessions) |
|---|---|---|
| Where | iPad client | Repo build step, published as config |
| Feedback needed | instant | can wait for daily/weekly config publish |
| Loops | 4 (difficulty), Leitner box moves | 1 (next target), 3 (bandit assignment, once built), 2 (global retention params) |

**Decision:** policy logic lives in exactly one place per loop. The client never re-derives target selection or bandit assignment; it only applies difficulty tuning and Leitner mechanics locally, using parameters supplied in the last-published config. **Alternative considered:** compute everything client-side against the local event log. Rejected — it would require re-implementing repo-side selection logic in the client, and the two implementations would drift.

### Stack: TypeScript throughout, no game engine

The assessment is UI (tap targets, transitions, audio), not a physics/sprite simulation. **Decision:** plain web (DOM/CSS for text and layout, Canvas/SVG for stroke paths, GSAP or Motion for tween/juice). CJK text rendering quality is a core product requirement (typography readability for a beginning reader), and browsers render CJK substantially better than any game engine's text system. **Alternatives considered:** Godot (weaker CJK text layout, heavier web export, iOS Safari friction), Phaser/PixiJS as a foundation (unnecessary — reach for a sprite library later only if a specific future game mechanic needs it, e.g. a drifting-tap game in `modality-arms`).

This also lets the browser serve double duty as the future PDF typesetter (headless Chromium HTML→PDF) in the `printed-reader` change, sharing font and layout code with the app — the reason for the P0 spike below.

### App framework: Vite + React SPA, not Next.js

**Decision:** build the assessment as a client-only single-page app using Vite + React, packaged via `vite-plugin-pwa` (Workbox-based service worker generation, manifest), deployed as static output to Cloudflare Pages.

**Why not Next.js:** Next's core value — SSR/streaming, file-based multi-page routing, API routes, ISR/image optimization — is either irrelevant here (no multi-page site, no SEO surface) or actively in tension with the hard requirement that the app work fully offline with no server reachable. The Worker+D1 sync endpoint is already a separately deployed service (see architecture above), so there is no server-side rendering or API-route need for the app itself to fill. Adopting Next would mean carrying its Cloudflare adapter (`@opennextjs/cloudflare`) and edge-runtime compatibility constraints purely to get a routing/SSR system this project doesn't use.

**Why Vite specifically:** dev-server iteration speed is a named product requirement in this project's planning (rapid change-and-observe cycles with a 4-year-old tester), and Vite's dev server is the fastest available for this. Its static build output maps directly onto Cloudflare Pages with no adapter and no edge-runtime surface to reconcile.

**Alternatives considered:** SolidJS or SvelteKit (static mode) would both fit at least as well technically — this app is animation/UI-heavy with simple state, exactly their strength — and would ship a smaller bundle. Not chosen, on ecosystem-maturity and solo-developer-tooling grounds (React has the deepest library and AI-assisted-development support), but this is a low-stakes choice and reversible without touching any spec.

### Stroke data and interaction: adopt hanzi-writer, don't hand-roll it

**Original plan (superseded):** integrate raw Make Me a Hanzi stroke-path data ourselves and hand-build both the animation (progressive path reveal) and the tracing/quiz interaction (raw PointerEvents on a `<canvas>`).

**What happened:** building the raw-PointerEvents version as a P0 spike (`spikes/pencil-input/`) surfaced four distinct real bugs in quick succession — hover movement being drawn as ink, `e.buttons` being unreliable on a fresh press after a pause, a `resize` listener that cleared the canvas mid-gesture (iOS fires `resize` when its toolbar auto-hides during touch interaction), and one still-unresolved issue where touch-down itself silently fails to register on certain rapid-succession touches. Three fixed, one open, in ~150 lines of code. That pattern — each fix revealing another bug in the same class of problem — is the signal to stop hand-rolling and check for a library, not a signal to keep patching.

**Decision:** adopt [hanzi-writer](https://github.com/chanind/hanzi-writer) (MIT license, ~10kb gzipped, npm-published as recently as Sept 2025 — actively maintained, not abandoned) for both stroke-order animation and stroke tracing/quiz interaction. It's built directly on Make Me a Hanzi data (via the `hanzi-writer-data` package, which carries the same Arphic Public License forward — already tracked in `data/PROVENANCE.md`'s license discipline), so the character-data integration work is unchanged; only the animation/interaction *code* is replaced with a dependency instead of hand-rolled canvas logic. Its `quiz()` mode has had production use across thousands of sites for years, meaning the exact class of touch/pointer bugs we hit has very likely already been found and fixed upstream, or never existed because an experienced library author was more careful from the start (e.g. it doesn't attach a `window resize` listener that clears the drawing surface).

**How this fits the no-visible-grading requirement:** `quiz()` takes `showHintAfterMisses: false` and `highlightOnComplete: false` to suppress all on-character visual correctness feedback — the `onMistake`/`onCorrectStroke`/`onComplete` callbacks still fire for our own event logging, they just don't render anything to the learner. This is a config flag, not a rebuild, and was verified directly in `spikes/hanzi-writer-quiz/`.

**Trade-off accepted:** one more runtime dependency (~10kb) instead of code we fully own. Given the alternative was continuing to debase engineering time re-deriving bug fixes a mature library already has, this is the right trade at this scope. If a future need falls outside what `hanzi-writer` offers (e.g. a bespoke non-tracing interaction), reach for a narrower library first — `spikes/hanzi-writer-quiz/PROVENANCE.md` and this section are the reference for why hand-rolling was rejected here.

**Unchanged:** stroke interaction is still logged with full fidelity for future analysis (Loop 3, matched-pair randomization) via the `onMistake`/`onCorrectStroke` callbacks feeding `learner-state` events — the *product* requirement (log fully, never grade a 4-year-old) is identical to the original plan; only the implementation approach changed.

### Audio unlock requires an HTMLMediaElement, not just AudioContext.resume()

**Finding, confirmed directly on iPad Air Safari (`spikes/ios-constraints/`), not from documentation:** calling `AudioContext.resume()` on a user gesture updates the JS-visible `.state` to `"running"`, but does not reliably open the native audio session — a tone played immediately after can be genuinely silent despite `state === "running"`. Playing through an `<audio>` element on the same gesture *does* open the session — and once it has, WebAudio output starts working too, since they share the same underlying session. Reproduced consistently: WebAudio alone → silent; `<audio>` element → audible; WebAudio again afterward → now also audible.

This matches a known-in-the-wild WebKit quirk (the reason libraries like Howler.js have historically primed audio with a silent/short native media element on first gesture before relying on WebAudio) — confirmed here empirically rather than assumed from that prior art.

**Decision:** task 8.3's first-gesture audio-unlock screen (Section 8) must play a short sound through an `HTMLAudioElement` as part of that first gesture — not `AudioContext.resume()` alone — before any WebAudio-based playback (narration, sound effects, tone-based feedback) is trusted to be audible. Concretely: on the unlock tap, play a tiny `<audio>` clip (can double as the "welcome" sound), then proceed to use WebAudio normally for everything else in the session.

**Trade-off:** none really — this is strictly additive (one more short audio element play call on the unlock gesture) and costs nothing in complexity, since the app already needs *a* first sound to play on unlock regardless of which API produces it.

### Guess detection thresholds

Two-hit confirmation with a latency cutoff is chosen over a single-hit or accuracy-only scheme because a 4-year-old will guess confidently and land correctly at chance-plus-recognition-bias rates on a 3-4 option layout. **Decision:** default latency threshold ~2000ms for "fast", ~3000ms "slow", both configurable per-learner as motor/decision speed changes over months. **Trade-off:** this slows down how quickly a character can be marked `known`, which is accepted deliberately — a false "known" pollutes every downstream projection (curriculum selection, story generation whitelist) more expensively than a delayed true one.

### Sequencer bootstrap: fixed Phase A, then greedy Phase B

The scoring function's terms (word-unlock, story-unlock potential) are all zero when the known-set is empty, so no ranking is possible at the start. **Decision:** a hand-authored fixed order for the first 25 productive characters, sourced from this project's discussion (grammar skeleton + basic concrete pictographs), used until exhausted — skipping any the assessment discovers she already knows. Phase B's scoring runs only once Phase A is exhausted, when there is enough known-vocabulary for its terms to be meaningful.

### Scoring function scope gap: word-unlock and story-unlock are stubs, flagged not silently absorbed

Implementing the Phase B scoring function (Section 6) surfaced a real gap between what the `curriculum` spec asks for and what data exists in this change's scope. Two of its five scoring factors need data no capability provides yet:

- **word-unlock** ("potential words unlocked") needs word-level data — which compound words a character participates in. CC-CEDICT is license-cleared (`data/PROVENANCE.md`) but has never been integrated anywhere; building that integration (fetch, parse, index by character, decide how "unlock" is quantified) is a real, separate data-sourcing task, not a two-line addition.
- **story-unlock** ("potential story content unlocked") needs a story/episode corpus to check candidates against. That corpus doesn't exist until the `printed-reader` change (phase P3) — explicitly out of scope for `bootstrap-shizi-assessment` per proposal.md.

**Decision:** both factors are implemented as explicit, documented functions that return a neutral 0 for every candidate, wired into the same weighted-sum architecture as the other three factors (so enabling them later is a function-body change, not a redesign). **Not** implemented as silent no-ops — each has a code comment explaining exactly what's missing and why, and this design.md entry exists so the gap is visible at the project level, not just to someone reading `scoring.ts`.

**Trade-off accepted:** Phase B selection currently runs on personal-relevance + learnability + confusability-penalty only (3 of 5 intended factors). This is a real reduction in selection quality until word/story data exists, accepted because fabricating either dataset now would mean inventing content-authoring infrastructure (the `printed-reader` change's actual job) inside a data-core change, or bolting on an unreviewed CC-CEDICT integration outside its own task. **Revisit when:** CC-CEDICT is first integrated for any purpose (wire word-unlock then), or when `printed-reader` exists (wire story-unlock then).

### Validator built ahead of its first consumer

The `content-validator` capability is fully specified and implemented in this change even though no authoring pipeline calls it yet (that arrives in `printed-reader`). **Decision, deliberate:** fixing the validator's contract now means the `printed-reader` design can treat it as a given interface rather than co-designing it under that change's own time pressure. **Alternative considered:** defer the validator entirely to `printed-reader`. Rejected — the curriculum's confusability-spacing logic and the validator's confusable-adjacency check share the same underlying character-data relationship, and building both together avoids defining that relationship twice.

### Matched-pair randomization is assignment-only in this change

Per `adaptivity-instrumentation`, pairs are matched and randomly assigned to arms starting now, but only one arm (whatever the assessment itself implements) is live — the others are placeholders that simply don't get exercised yet. **Decision:** record assignments regardless, so that when `modality-arms` ships additional arms, historical assignment records already exist for characters introduced earlier, rather than starting the randomization clock only when all arms exist.

### Auth: shared token, not accounts

Single-family, low-stakes data. **Decision:** one long-lived bearer token embedded in the client, checked by the Worker; no user accounts, no OAuth. **Risk accepted explicitly:** a leaked token allows spurious writes; mitigated by the event log being append-only and filterable by session identifier, so bad data can be excluded from projections without needing deletion.

### Data provenance verification as a first-class task, not a footnote

Make Me a Hanzi (stroke paths), LXGW WenKai (font), and CC-CEDICT (glosses) are the working assumptions for external data sources. **Decision:** license verification for each is an explicit P0 task with a go/no-go gate — no downstream task consumes a dataset before its license check passes — rather than an assumption carried silently into later work.

## Risks / Trade-offs

- **[Risk]** Stroke-path or font data license turns out to be incompatible with the intended use → **Mitigation:** P0 spike explicitly gates on this before any dependent work starts; fallback sources identified (e.g., other open Kai-style fonts) if the primary choice fails verification.
- **[Risk]** Two-hit + latency confirmation feels slow in practice, extending assessment sessions beyond the 60-90s bound → **Mitigation:** thresholds are configurable; tune after observing real sessions (see Open Questions).
- **[Risk]** iOS Safari audio-unlock-on-gesture and storage-eviction behavior breaks the "never see a failure" requirement → **Mitigation:** P0 spike tests this specifically; design includes an explicit first-gesture unlock screen and treats IndexedDB as non-durable (repo export is the durable copy).
- **[Risk]** Hand-authoring Phase A's 25 characters and hand-tagging ~200 candidates introduces subjective bias with no second reviewer → **Mitigation:** accepted; this is a single-learner tool and the parent is the domain expert. Bias is a smaller risk here than an unreviewed automated ranking would be.
- **[Risk]** Building the validator ahead of its consumer risks designing an interface that doesn't fit `printed-reader`'s actual needs once that change is designed → **Mitigation:** validator rules are individually configurable (thresholds, not hard-coded logic), leaving room to adjust without a rewrite.
- **[Trade-off]** Fast/slow loop split adds a config-publishing step (repo build → Worker) instead of one simpler always-client-computes model → accepted, because it keeps policy logic single-sourced as adaptive complexity grows in later changes.

## Migration Plan

No existing users or data to migrate — greenfield. Rollout is sequential and gated:

1. P0 spikes complete with explicit go/no-go on each license check and rendering test before P1 starts.
2. P1 (data core) complete and validated (candidate pool populated, tagged, license-clean) before P2 begins, since the assessment's probe pool depends on it.
3. P2 (assessment) deployed to a single static hosting environment; the iPad accesses it via add-to-home-screen. No staged rollout beyond this — single learner, single device.

**Rollback:** static hosting redeploys are cheap and instant; reverting to a prior build is a redeploy, not a data migration, since learner state lives in the append-only log independent of app version. If the assessment proves unusable, 悟空识字 remains available with no disruption, per the parallel-run decision.

## Open Questions

- Exact numeric defaults for guess-detection latency thresholds, the 80-85% difficulty band, and the 4:1 dilution ratio are set to the values discussed in this project's design conversation but SHOULD be tuned after the first 1-2 weeks of real sessions. Tuning these does not change the specs (all are already specified as configurable) or the task breakdown.
- Final content of the fixed Phase A 25-character list and the ~200-character candidate pool depends on the parent's hand-tagging pass (concreteness/pictographic flags) and confirmation of identity-set characters — tracked as tasks, not a design blocker.
- Whether Cloudflare D1 or an alternative (e.g., KV, Durable Objects) best fits the hosted event store can be settled during P1 implementation without affecting the specified behavior (append-only, idempotent, exportable).
