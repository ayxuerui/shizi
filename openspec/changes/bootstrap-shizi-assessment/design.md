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

### Provisional draft tags unblock the pool ahead of the parent's review

Task 3.3's hand-tagging pass was still blocked on parent input, and `exclusion.ts`'s required-field gate meant the candidate pool had exactly 0 usable characters — the assessment engine (Section 8) would have had nothing to probe. **Decision:** `scripts/build-tags.mjs` generates draft concreteness/pictographic tags for all 209 characters from `data/tagging-review.csv` and folds them into `pool.ts`, gated by a new `tagSource: "draft" | "reviewed" | null` field on `CharacterAttributes`. This is deliberately not the same thing as task 3.3 being done: the `character-data` spec's "Human-supplied concreteness tag" scenario specifically calls a manually-supplied tag *authoritative* — a generated draft is not manually supplied, so `tagSource` exists precisely so "draft" can never be silently read as "reviewed." Re-running the script after the parent's corrections come back (renaming the CSV's columns to drop the `_DRAFT` suffix) flips rows to `"reviewed"` with no code change needed. **Trade-off accepted:** curriculum/assessment selection now runs against tags nobody has actually reviewed yet — acceptable because the alternative (0 usable characters) blocks all of Section 8, and every consumer can still filter or warn on `tagSource === "draft"` if that distinction ever matters downstream.

### Identity-set characters bypass the exclusion gate for probe selection specifically

The `assessment` spec's "Identity and previously-flagged characters are probed too" scenario requires identity-set characters (薛亦霖/小蓝莓) as probe candidates, but they can never pass `character-data`'s `isUsable` check — they have no `frequencyRank` (they're not in the HSK1 source list at all) and never will, since they're logos, not frequency-ranked productive vocabulary. **Decision:** `assessment-engine`'s probe selection (`session.ts`) reads `IDENTITY_CHARACTERS` directly rather than filtering through `isUsable`, for this one purpose only. This isn't a contradiction of `character-data`'s exclusion scenario, which is explicitly scoped to "curriculum selection and distractor selection" — identity-set probing is neither; it's the assessment discovering whether the child already recognizes her own name, which has always been true independent of any hand-tagging pass.

### Guess detection reuses `computeMasteryStates` rather than reimplementing the two-hit rule

`learner-state`'s `computeMasteryStates` (Section 4) already implements two-consecutive-fast-correct → `known`, including the "slow-correct breaks the streak" interpretation decided there. **Decision:** `assessment-engine`'s `guess-detection.ts` classifies only a single response (confirming/inconclusive/miss, for immediate session-local signal — e.g. updating the frontier bracket on a miss); `session.ts` calls `computeMasteryStates` directly for the actual known/shaky determination, every time, from the full event log. Its `fastThresholdMs` default is sourced from `DEFAULT_MASTERY_CONFIG.guessDetectionThresholdMs`, not redefined, so the two can never silently drift apart — the same single-source-of-truth argument this document already makes for the fast/slow loop split (see "Fast loops / slow loops" above). **Not implemented:** design.md's second "slow" threshold (~3000ms) has no spec'd consumer — `computeMasteryStates` only checks one cutoff — so no three-way classification was fabricated to use it; it remains a documented, unconsumed future per-learner tuning knob.

### `packages/assessment-engine`: a new package for Section 8's headless logic

Section 8 mixes pure, unit-testable algorithms (frontier search, guess detection, dilution, Loop 4 calibration, event/assignment wiring) with a full React/PWA UI. **Decision:** split into two passes, mirroring how Section 7 added `packages/adaptivity` as an un-scaffolded gap when it needed somewhere to live: `packages/assessment-engine` holds every piece of Section 8 that has no DOM/rendering dependency, fully driven by an injected `SessionDeps` (clock, randomness, id generation) so it's deterministic and testable exactly like `packages/adaptivity`'s `AssignmentDeps` precedent. `apps/assessment` will consume this package for its actual game logic once the PWA shell/UI pass lands, rather than re-deriving any of it inline.

### Drive-by fix: `typecheck`/`build` never actually passed on a clean checkout

Discovered while verifying this pass's own changes, not something introduced by them: every package's `tsconfig.json` uses composite TypeScript project references, but the root `typecheck`/`build` scripts ran each workspace's bare `tsc --noEmit` / `tsc -b` directly with no guaranteed build order, and `dist/` is gitignored. On a genuinely clean checkout (or CI, which runs Typecheck before Build), this fails with TS6305 ("output file has not been built from source") on every package that depends on another — it only ever appeared to work locally because a stale `dist/` from a prior run was still on disk. **Decision:** root `build`/`typecheck` scripts now run `tsc -b` (which builds every composite reference transitively, in dependency order) before iterating per-workspace scripts. Verified by deleting all `dist/`/`*.tsbuildinfo` and confirming `npm run typecheck`, `npm run build`, `npm test`, and `npm run lint` all pass standalone, in any order, from that clean state.

### `hanzi-writer` confirmed to have no role in this change's actual gameplay

Section 8's actual UI work surfaced a question the earlier hanzi-writer decision (see above) didn't fully close: does the assessment game itself need it? **Answer: no**, confirmed by re-reading the `assessment` spec end to end — every requirement is about tap-based option selection (hear-tap), narrative framing, dilution, calibration, session bounds, and offline behavior; none mentions stroke rendering or tracing. `apps/assessment` has no `hanzi-writer` dependency and renders every character as plain text through the LXGW WenKai subset font. The earlier P0 spike work and adoption decision still stand — they're groundwork for the `modality-arms` change's future tracing arm, not something this change's own UI needed to consume.

### Font subset is real; audio, art, and PWA icons are explicit placeholders

Task 8.1 needs a font subset, narration/interaction audio, 悟空 art, and PWA icons — none of which existed anywhere in the repo before this pass (verified directly: zero committed image/audio/font files). **User decision this session:** source the font for real (it has a cleared license and a scriptable path); stub everything else, flagged rather than silently absorbed, matching the same discipline as `curriculum`'s word-unlock/story-unlock stub functions.

**Font (real):** `apps/assessment/scripts/build-font-subset.ts` downloads LXGW WenKai Regular (release v1.522 — the exact repo/release `data/PROVENANCE.md`'s task 2.2 verified, deliberately NOT the separate "Lite" repo the `pdf-render` P0 spike used for convenience) and subsets it via `subset-font` (harfbuzz-wasm; chosen over `pyftsubset`/`glyphhanger` because it needs no Python toolchain) to exactly this project's candidate pool + identity set + UI copy (`src/copy.ts`) + ASCII/punctuation — verified character-by-character against the source font (via `opentype.js`) before subsetting, so a missing glyph fails the build loudly rather than shipping silent tofu. Output: 305 characters, 60KB, committed to `apps/assessment/public/fonts/` alongside `OFL.txt` and a `subset-manifest.json` change-note (mirroring `packages/character-data`'s Arphic-license `CHANGES.md` precedent). **Deviation from tasks.md's literal "data/" wording:** the subset lives under `public/`, not `data/` — Vite only serves and workbox only precaches files under `public/`; noted here rather than silently diverging.

**Audio, art, icons (placeholder):** `unlock-tone.wav`/`interaction-cue.wav` are short, gently-enveloped sine tones (not the spike's exact reused base64 clip — regenerated as real files so the offline precache path is genuinely exercised); `WukongPlaceholder.tsx` is an inline SVG shape; the three PWA icons are solid-color placeholder PNGs. All are real, committed, functioning files — not empty stubs — so the precache/install/no-failure-cue mechanics are all genuinely testable now, with the actual asset *content* swappable later without touching any of the surrounding code.

### Narration audio is the biggest gap this pass still carries

A hear-tap game's core loop needs something to *hear*. **Decision:** `audio/narration.ts`'s `createSpeechSynthesisPromptVoice` speaks the target character aloud via the Web Speech API (`zh-CN`) as a documented stopgap — real family-voice recording is explicitly out of scope here (`progression-and-voices`, per proposal.md). **Known, flagged risk, not yet resolved:** zh-CN `SpeechSynthesis` availability on iPad Safari is unverified — no P0 spike covered this, and design.md's existing iOS audio findings are about `AudioContext`/`HTMLAudioElement`, not `SpeechSynthesis`. `isAvailable()` exists precisely so the UI can detect and degrade (e.g. relying on the on-screen glyph plus a silently-inert "listen again" button) rather than fail invisibly. **Revisit before the first real session** (tasks.md Section 10) — this is the one placeholder in this pass that could make the game literally unplayable as designed if the voice isn't available, unlike the others (art/icons/interaction tone), which only affect polish.

### Enforcing "no visible scoring" structurally, not just by convention

The assessment spec's "no numeric score, no pass/fail, no failure-state cue" requirement is easy to violate by accretion — one score-ish debug label added later, one red error state added for "just this one case." **Decision:** make violations a type error, not a code-review catch. `session/bout-machine.ts`'s `BoutState` has no score/accuracy/correct-count field at all — a running or final score is unrepresentable, not just unrendered. `feedback/cues.ts`'s `CueKind` union is `"acknowledge" | "redirect" | "advance"` — there is no error/wrong/miss member, so a red "you got it wrong" treatment requires adding a new member to a shared, reviewed type first, not just dropping a class name into a component. `BoutScreen.test.tsx` asserts this at the DOM level too (no digit/`%` ever renders across a full scripted bout), so the guarantee is checked in three independent places: the type, the reducer's behavior, and the rendered output.

## Risks / Trade-offs

- **[Risk]** Stroke-path or font data license turns out to be incompatible with the intended use → **Mitigation:** P0 spike explicitly gates on this before any dependent work starts; fallback sources identified (e.g., other open Kai-style fonts) if the primary choice fails verification.
- **[Risk]** Two-hit + latency confirmation feels slow in practice, extending assessment sessions beyond the 60-90s bound → **Mitigation:** thresholds are configurable; tune after observing real sessions (see Open Questions).
- **[Risk]** iOS Safari audio-unlock-on-gesture and storage-eviction behavior breaks the "never see a failure" requirement → **Mitigation:** P0 spike tests this specifically; design includes an explicit first-gesture unlock screen and treats IndexedDB as non-durable (repo export is the durable copy).
- **[Risk]** Hand-authoring Phase A's 25 characters and hand-tagging ~200 candidates introduces subjective bias with no second reviewer → **Mitigation:** accepted; this is a single-learner tool and the parent is the domain expert. Bias is a smaller risk here than an unreviewed automated ranking would be.
- **[Risk]** Building the validator ahead of its consumer risks designing an interface that doesn't fit `printed-reader`'s actual needs once that change is designed → **Mitigation:** validator rules are individually configurable (thresholds, not hard-coded logic), leaving room to adjust without a rewrite.
- **[Trade-off]** Fast/slow loop split adds a config-publishing step (repo build → Worker) instead of one simpler always-client-computes model → accepted, because it keeps policy logic single-sourced as adaptive complexity grows in later changes.
- **[Risk]** `audio/narration.ts`'s `SpeechSynthesis`-based zh-CN prompt voice — the hear-tap game's only "hear" mechanism right now — has unverified availability on iPad Safari; if unavailable, the assessment is unplayable as designed, not just less polished → **Mitigation:** `isAvailable()` lets the UI degrade rather than fail silently; this is the first thing to check in the Section 10 on-device pass, before anything else.

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
