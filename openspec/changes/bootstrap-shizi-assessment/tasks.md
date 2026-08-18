## 1. Repo scaffolding

- [x] 1.1 Set up TypeScript monorepo structure (`apps/assessment`, `packages/character-data`, `packages/curriculum`, `packages/validator`, `packages/learner-state`, `infra/`, `data/`)
- [x] 1.2 Configure shared TS/lint/test tooling across packages
- [x] 1.3 Set up CI to run lint + tests on push

## 2. P0 spikes (go/no-go gates before P1)

- [x] 2.1 Verify Make Me a Hanzi license permits intended use; record verification result in `data/PROVENANCE.md` — GO. `graphics.txt` (the file we need) is Arphic Public License, not LGPL; carries real copyleft-style conditions, see PROVENANCE.md.
- [x] 2.2 Verify LXGW WenKai license permits intended use; record verification result in `data/PROVENANCE.md` — GO. SIL OFL 1.1; project's own README explicitly permits web-font subsetting under the reserved-name exception.
- [x] 2.3 Verify CC-CEDICT license permits intended use; record verification result in `data/PROVENANCE.md` — GO. CC BY-SA 3.0; requires attribution + share-alike on any derivative we commit.
- [x] 2.4 Spike: render a stroke-path-driven animation for a sample character in-browser; confirm visual quality on an actual iPad Air — PASS, confirmed "all good" on device. Implementation approach superseded: adopting `hanzi-writer` library rather than the hand-rolled stroke-dashoffset animation this spike used — see design.md "Stroke data and interaction: adopt hanzi-writer". The visual-quality finding stands; only the how-we-build-it changed.
- [x] 2.5 Spike: test Apple Pencil input on iPad Air Safari — pressure/tilt availability, palm-touch behavior alongside pencil input — PASS via `spikes/hanzi-writer-quiz/` (fast writing, pauses, palm rejection all confirmed working on device). Hand-rolled canvas version (`spikes/pencil-input/`) hit 3 real bugs (fixed) and 1 unresolved before being superseded — not pursued further, since `hanzi-writer` is the adopted implementation (see design.md).
- [ ] 2.6 Spike: test iOS Safari audio-unlock-on-gesture behavior and PWA storage eviction behavior; document constraints for the assessment build — audio-unlock half RESOLVED (see design.md). Storage-eviction half genuinely blocked on real-world elapsed time (needs the iPad to sit untouched for several days); not implementable on demand.
- [x] 2.7 Spike: render sample CJK text with LXGW WenKai via headless Chromium HTML→PDF, to de-risk the future print pipeline (no PDF feature ships in this change) — PASS, verified visually. No tofu, correct 楷体 style, clean A4 layout. See `spikes/pdf-render/README.md`.
- [ ] 2.8 Go/no-go checkpoint: confirm all licenses clear and both rendering spikes are acceptable before starting Section 3 — NOT formally met (2.6's storage-eviction half still open). **Explicitly waived by user decision, 2026-08-17**, to proceed into Section 3 now rather than wait on a multi-day real-world observation. Accepted as a documented, open risk, not a silent skip — revisit if the eventual storage-eviction finding contradicts assumptions already built into Section 4 (learner-state)/Section 8 (offline queue) work.

## 3. Character data core

- [x] 3.1 Assemble ~200-character candidate pool from frequency data + this project's curated selections — 203 productive characters: HSK 3.0 Level 1 (MIT-licensed, real source — see `packages/character-data/src/data/pool-membership.ts`) individually reviewed and curated down from 300, plus Phase A plus 3 thematic additions (悟空姥). Full reasoning and a deferred tier-2 list documented in code comments.
- [x] 3.2 Confirm and record identity-set characters (薛, 亦, 霖, 小, 蓝, 莓) as non-productive — `IDENTITY_SET`/`isIdentityCharacter` in `packages/character-data`.
- [ ] 3.3 Collect parent hand-tagging pass: concreteness/imageability and pictographic-origin flags for all ~200 candidates — BLOCKED on parent input. Draft tags generated for all 209 characters to speed up review (correct rather than originate from scratch) — see `data/tagging-review.csv` and `data/TAGGING-REVIEW.md`. Also needs a frequency-rank judgment call for 悟/空/姥/木 (outside the HSK1 source).
- [x] 3.4 Integrate stroke-count and ordered stroke-path data per candidate character — real Make Me a Hanzi data for all 209 characters (pool + identity), verified against known stroke counts in tests.
- [x] 3.5 Compute confusability relationships (shared-stroke / near-mirror / component-difference) across the pool — curated pedagogical pairs + a computed geometric-shape-similarity fallback (`computeConfusability`), tested.
- [x] 3.6 Build exclusion logic: candidates missing a required attribute are excluded from selection until supplied — `isUsable`/`missingAttributes`/`partitionByUsability`, tested. Correctly excludes the entire pool right now, since 3.3 hasn't happened yet — that's expected, not a bug.
- [x] 3.7 Write the fixed 25-character Phase A sequence (grammar skeleton + identity + basic pictographs) as a reviewable, hand-authored list — `PHASE_A_SEQUENCE`, length-asserted at 25, deliberately excludes every identity character.
- [ ] 3.8 License compliance: bundle `ARPHICPL.TXT` + a change-note with the subsetted stroke-path data, and add `data/ATTRIBUTIONS.md` covering CC-CEDICT's BY-SA attribution (per `data/PROVENANCE.md` action items) — Arphic half DONE (`packages/character-data/src/data/ARPHICPL.TXT` + `CHANGES.md`). CC-CEDICT half deliberately NOT done: no CC-CEDICT data (glosses/pinyin) has actually been incorporated anywhere yet in this pool — only character identity was used, sourced from HSK1, not CEDICT. Attributing a dataset not yet used would be premature; revisit when CC-CEDICT is actually integrated.

## 4. Learner state

- [x] 4.1 Define the event schema (id, timestamp, session id, character, activity/modality, outcome, latency, position-in-session, prior-exposure-count, days-since-last-exposure, time-of-day, adult-present) — `packages/learner-state/src/types.ts`.
- [x] 4.2 Implement append-only event log with client-generated idempotency keys — `EventLog`, no mutate/delete API exists at all (structural guarantee, not just a runtime check).
- [x] 4.3 Implement mastery-state projection (`unseen`/`probing`/`known`/`shaky`) per the promotion/demotion rules — `computeMasteryStates`. One interpretation decision documented in code: a slow-correct response breaks the consecutive-fast streak the same way a miss does, and can also demote an already-known character (per spec's literal wording).
- [x] 4.4 Implement known-set projection derived from mastery state — `computeKnownSet`. Interpretation decision documented in code: known-set = `known` ∪ `shaky` (shaky is "due for review," not "not known" — matches the shaky-seeding design intent elsewhere).
- [x] 4.5 Implement rejection of malformed/incomplete events and of any mutate/delete attempt on existing events — `validateEvent` (required = present, not truthy — several fields legitimately allow `0`/`false`/`null`) + `EventLog`'s lack of a mutate/delete method.
- [x] 4.6 Implement repo-side JSONL export script (hosted store → durable versioned file) — `exportToJsonl`/`parseJsonl`, storage-agnostic core. The D1-specific pull wrapper is task 9.5's job once D1 exists (Section 9); this function is what that wrapper will call.
- [x] 4.7 Write projection replay tests: given a fixed event log, projections are deterministic and reproducible after logic changes — `projection-replay.test.ts`, including a full export→parse→reproject round trip.

## 5. Content validator

- [x] 5.1 Implement whitelist check (identity ∪ known ∪ declared new-targets) with hard-failure reporting — `checkWhitelist`. Interpretation decision documented in code: only actual Han characters (CJK Unified + Ext-A ranges) are checked; punctuation/whitespace are always permitted, since they aren't literacy targets.
- [x] 5.2 Implement new-target repetition-threshold check (default minimum 8) with hard-failure reporting — `checkRepetitionThreshold`.
- [x] 5.3 Implement new-character density check (default max 5%) with hard-failure reporting — `checkDensity`.
- [x] 5.4 Implement shaky-character seeding advisory check (warning only) — `checkShakySeeding`. Interpretation decision documented in code: "off-target" tolerance band set at ±2x the configured target density.
- [x] 5.5 Implement confusable-adjacency advisory check (warning only) — `checkConfusableAdjacency`, checks raw-string adjacency (so punctuation between two characters correctly means they aren't "adjacent").
- [x] 5.6 Implement structured result type distinguishing hard failures from warnings, with rule id and location per finding — `types.ts`.
- [x] 5.7 Unit tests covering each rule's pass/fail/warn boundary conditions — `validate.test.ts`, one describe block per spec requirement.

## 6. Curriculum sequencer

- [x] 6.1 Implement Phase A selection: draw next not-yet-known character from the fixed sequence, skipping already-known ones — `selectFromPhaseA`.
- [x] 6.2 Implement Phase A exhaustion detection (transition point to Phase B) — `isPhaseAExhausted`.
- [x] 6.3 Implement Phase B scoring function (word-unlock, story-unlock, personal relevance, learnability, confusability penalty) with configurable weights — `scoreCandidate`. **Scope gap, flagged not absorbed:** word-unlock and story-unlock return a documented neutral 0 for every candidate — no capability provides word-level data (CC-CEDICT is license-cleared but not integrated) or a story/episode corpus (that's the `printed-reader` change, P3, out of scope here). personal-relevance and learnability use real per-character data. See design.md.
- [x] 6.4 Implement confusability hard-constraint filter against recently-introduced characters — `violatesSpacingConstraint`/`filterBySpacing`, count-based recent window (not time-based — see design.md, needed for reproducibility).
- [x] 6.5 Implement "no eligible candidate" fallback (decline to select rather than violate spacing) — `selectNextCharacter` returns `{status: "none-eligible", reason}`.
- [x] 6.6 Determinism tests: same state + config → same selection — covered across `scoring.test.ts` and `select.test.ts`.

## 7. Adaptivity instrumentation

- [ ] 7.1 Ensure all activity event-writers populate full schema, including fields with no current consumer (time-of-day, adult-present, session-position) — BLOCKED: no activity event-writer exists yet; this is an audit of Section 8's app code, which hasn't been built. `learner-state`'s schema already requires these fields (see `validation.ts`), so whatever Section 8 writes will be structurally forced to include them — revisit as part of Section 8.
- [x] 7.2 Implement matched-pair identification (stroke count, concreteness, frequency, confusability-neighborhood size) — new `@shizi/adaptivity` package (not scaffolded in Section 1 — a gap in the original plan, filled here since Section 7 needed somewhere to live). `findMatchedPairs`/`isMatchedPair`, tolerance-based matching, concreteness required to match exactly (categorical).
- [x] 7.3 Implement random arm assignment for matched pairs, recorded independent of outcome — `assignPairToArms` + `AssignmentLog` (append-only, no update/delete API, mirroring `learner-state`'s `EventLog` pattern). Handles the degenerate single-arm case explicitly (this change's actual state — only "hear-tap" exists).
- [ ] 7.4 Implement parent one-tap end-of-session rating capture (loved it / fine / checked out), linked to session id, with skip-without-blocking behavior — BLOCKED: this is a UI interaction (a rating prompt at session end), which belongs with Section 8's actual app and doesn't exist as a standalone unit yet.
- [x] 7.5 Confirm no ranking/effectiveness/routing computation exists anywhere in this change's code (explicit review checklist item) — reviewed directly across the whole change (`packages/`, `apps/`), not just the new package: grepped for effectiveness/routing/retention-model/bandit-style language (no matches anywhere) and manually read `packages/adaptivity`'s 3 source files. Note: `curriculum`'s `scoreCandidate` does compute a score — that's Loop 1 (character selection), a different, already-approved mechanism per design.md's phasing (live from week 1); this check is specifically about Loop 3 (modality-effectiveness/routing), which genuinely doesn't exist anywhere.

## 8. Assessment game (PWA)

- [ ] 8.1 Build PWA shell: service worker precache (app shell, font subset, audio, art assets), add-to-home-screen manifest — include `OFL.txt` alongside the bundled LXGW WenKai subset per `data/PROVENANCE.md`
- [ ] 8.2 Implement offline event queue (IndexedDB) with opportunistic flush to sync endpoint
- [ ] 8.3 Implement first-gesture audio-unlock screen: play an `HTMLAudioElement` clip on the unlock tap (not `AudioContext.resume()` alone — confirmed insufficient on iPad Air Safari, see design.md), then proceed to WebAudio for the rest of the session
- [ ] 8.4 Implement adaptive frontier-search probe selection (coarse-to-narrow, including identity-set and shaky-state probes)
- [ ] 8.5 Implement two-hit + latency-threshold guess-detection logic
- [ ] 8.6 Implement felt-difficulty dilution (configurable easy:informative ratio, default 4:1)
- [ ] 8.7 Implement Loop 4 difficulty calibration (rolling accuracy → distractor confusability adjustment)
- [ ] 8.8 Build narrative framing UI ("help 悟空" goal-oriented probes; progress advances regardless of correctness)
- [ ] 8.9 Build no-failure-state interaction feedback (neutral/gentle incorrect-response cue, no score display)
- [ ] 8.10 Implement session bounding (60-90s bout, positive closing beat)
- [ ] 8.11 Implement touch + stylus input handling with palm-rejection when stylus active, large touch targets
- [ ] 8.12 Wire assessment outcomes into learner-state event log (no parallel/disconnected state)
- [ ] 8.13 Wire matched-pair assignment calls into probe selection where applicable

## 9. Infra & deploy

- [ ] 9.1 Provision Cloudflare Pages (static hosting) for the PWA
- [ ] 9.2 Provision Cloudflare Worker + D1 for the sync endpoint; implement append-with-idempotency-key logic
- [ ] 9.3 Implement shared-token auth on the Worker endpoint
- [ ] 9.4 Implement repo-side config publishing step (known-set, next targets, probe pool, difficulty params → config.json consumed by client)
- [ ] 9.5 Set up the D1 → repo JSONL pull/export script as a scheduled or manually-triggered job

## 10. First real session

- [ ] 10.1 Deploy to the iPad via add-to-home-screen
- [ ] 10.2 Run first assessment bout with Eliana; observe engagement, session length, and whether the no-failure framing holds up
- [ ] 10.3 Record parent's qualitative observations alongside the one-tap rating for this first session
- [ ] 10.4 Review latency-threshold and dilution-ratio defaults against real session data; adjust config if needed (per design.md Open Questions)
