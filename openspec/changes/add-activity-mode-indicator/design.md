## Context

- The play loop currently runs three modules — learn (`ExposureScreen`, arms `expose-listen` /
  `expose-trace`), assess (`BoutScreen`, `hear-tap`), review (`MemoryScreen`, `hear-tap`) — chosen
  by `activity-selector.ts` and remounted under a new `key` by `PracticeRouter.tsx`. Each screen
  already knows exactly what it is; nothing renders that fact.
- The only parent-facing text convention in the app is `DiagnosticsScreen`'s: English/ASCII,
  deliberately never Chinese (a Chinese label would need a font-subset rebuild for a screen the
  child never sees). The `DEV` badge (`EnvBadge`) is the only chrome-like element, confined to
  unlock/diagnostics and explicitly never inside an activity bout.
- The `assessment` spec's no-visible-scoring guarantee is enforced in three places (type, reducer,
  `assertNoScoreLikeText()` over the rendered tree — `bootstrap` design.md:166). Any new text
  inside the bout tree must survive that assertion.
- `copy.ts` is the single source the font-subset script scans (`collectCopyCharacters()`); text
  added anywhere else renders as tofu once the subset font ships.
- Two of the three modules' capabilities are owned by changes that are still active, not archived:
  `exposure` by `add-tracing-modality-arm`, `memory-review` by `add-layered-learning-architecture`.
  Their spec deltas are the only place those capabilities' requirements exist right now.
- In-flight, uncommitted working-tree edits (tap-to-continue closing beats) touch the same three
  screens. Display-level only; no semantic overlap.

## Goals / Non-Goals

**Goals:**

- A supervising adult can tell, at a glance, which module and activity is running.
- One shared component; the three screens stay mirrors of each other.
- The indicator strengthens, never tests, the no-visible-scoring guarantee.
- Requirement text lands once per owning capability — including the two capabilities whose specs
  live in still-active changes.

**Non-Goals:**

- No diagnostics-screen-style telemetry panel, no event counters, no assignment IDs on screen —
  the indicator names what is running, nothing more.
- No child-directed meaning: the 4-year-old cannot read either language; the indicator must not
  become instructional content (no "now we trace!" prompts — that is the narrative stage's job).
- No change to arm assignment, event writing, or the rotation itself.
- Not a general theming/chrome system for the app.

## Decisions

### 1. Vocabulary: module and activity, everywhere — including the event log

The taxonomy this change locks in, chosen while reviewing the indicator's own naming, then unified
at the user's direction (no product/research split):

- **module** — the rotating pedagogical unit the orchestrator selects: `learn` / `assess` /
  `review`. Each has its own engine, screen, and spec — a self-contained module. (Not "mode",
  which implies a toggle of one thing; not "phase", which implies strict linearity when the loop
  actually repeats.)
- **activity** — the concrete interaction the child performs within a module: `listen` /
  `trace` / `hear-tap`. The child never "does an assessment"; she does a tracing activity.
- **arm** — adaptivity's assignment term for the randomized pair member (listen/trace are
  assigned as arms; hear-tap never is). Unchanged: it names the experiment's assignment slot,
  not the interaction.

**Unified, not split:** the event schema uses the same words — the field is renamed
`modality` → `activity` and the `expose-listen`/`expose-trace` values become real activity ids.
A two-register design (product words vs. log words) was considered and rejected: the mapping tax
is permanent, and the rename can land while the durable record is still verification-only data.
That rename is its own change (`rename-event-modality-to-activity`); this change only fixes the
product-facing vocabulary and waits for it.

This decision required aligning existing prose: `add-layered-learning-architecture`'s artifacts
(previously "activity kind" for learn/assess/review) now read module, and the main specs' ambiguous
"activity" lines were pointed at the right level. Main-spec prose that uses "activity" as an
umbrella for anything learner-facing is left alone until those capabilities next change.

### 2. One shared `ActivityModeIndicator` component, fed by props each screen already has

Each screen passes its module and activity as plain strings (`module="assess" activity="hear-tap"`,
`module="learn" activity={arm}`, `module="review" activity="hear-tap"`); the component owns label
text, styling, and placement. No screen derives anything.

**Why not read the decision from context/router:** the screens are deliberately dumb mirrors of
engine state; threading one more prop keeps that shape and makes the indicator trivially testable
per screen.

### 3. Bilingual labels as parent-facing chrome, breaking the "no Chinese outside child copy" precedent deliberately

`学 LEARN`, `描 TRACE`, `听 LISTEN`, `测 ASSESS`, `听选 HEAR-TAP`, `复习 REVIEW` — Chinese first
(the parent's native reading), English alongside (matching diagnostics' parent-facing convention).
The strings live in `copy.ts` under a new `activityMode` key so `collectCopyCharacters()` picks
them up; the font subset is rebuilt (学/描/听选/测/复/习 are new glyphs — 听/玩/一 already covered).

**Why not English-only:** the user chose bilingual — the supervising parent reads Chinese natively,
and the English half preserves the "grown-up chrome" visual signature. **Why not route through the
diagnostics palette:** that module is deliberately unreachable from the child's tree; the indicator
needs its own muted styling from the shared design tokens instead.

### 4. Fixed position, muted style, no animation — subordination is the spec's testable edge

Top-corner chip, small type, lowest-contrast token that still passes readability, no transitions.
The delta spec's "visually subordinate" scenario is what bans attention-grabbing treatment; the
implementation should be boring enough that no future contributor mistakes it for content.

**Why not only-on-entry (a toast that fades):** "we know what's happening" means *while* it is
happening — a parent glancing over mid-bout needs the answer on screen then, not 20 seconds earlier.
Persistence is also what makes the no-digit assertion meaningful across the whole bout including
the closing beat.

### 5. The requirement lands in each owning capability — including two deltas this change does not own

`assessment` is delta'd here (the only affected capability in main specs). For `exposure` and
`memory-review`, this change adds one matching ADDED-requirement sentence to
`add-tracing-modality-arm`'s and `add-layered-learning-architecture`'s deltas respectively — the
established cross-change coordination pattern (layered change task 8.5 amends
`add-memory-curve-review` the same way). One definition of the indicator requirement exists across
all three capabilities; none is duplicated.

**Alternative rejected — a new `activity-visibility` capability owning all three screens:** it
would slice each activity's screen contract across two capabilities and create a fourth place to
check when touching any activity. The indicator is a property of each screen, not a capability.

**Alternative rejected — spec-less implementation:** the repo's whole discipline is that
learner-facing surfaces have stated behavior. "A parent-facing label inside the bout tree" is
exactly the kind of accretion the three-layer no-score enforcement exists to catch; leaving it
unspec'd would make the next `assertNoScoreLikeText` failure a code-review argument instead of a
spec citation.

### 6. Coexistence with the in-flight tap-to-continue edits

Both changes touch the same three screens' closing regions but not the same lines (indicator is a
corner chip; tap-to-continue is the closing beat's action). No rebase order matters; whichever
lands second rebases trivially. This change's tasks do not depend on those edits being committed.

## Risks / Trade-offs

- **[Risk] A parent-facing label normalizes chrome inside the child's tree.** The `DEV` badge was
  explicitly confined to non-bout screens; this change deliberately crosses that line for the first
  time. → The subordination scenario makes the boundary spec'd rather than customary: any future
  chrome inside an activity must be purely graphical text, muted, fixed, and digit-free or it needs
  a new spec delta.
- **[Risk] Bilingual labels widen the font subset.** Six-plus new glyphs in LXGW WenKai — a
  measurable but small precache delta. → Rebuild via the existing `build:font` script; the
  precache check (`check-precache.mjs`) fails the build if the subset drifts.
- **[Risk] The two coordination edits touch changes that may archive at different times.** If
  `add-tracing-modality-arm` archives before this change lands, its exposure requirement must
  already contain the sentence; if after, the sentence rides in its delta. Either ordering leaves
  exactly one definition — but if a delta is *removed* unimplemented, this change's task must be
  re-pointed. → Coordination tasks name both target files explicitly so the re-point is findable.
- **[Trade-off] Screen real estate on small devices.** A persistent chip costs corner space on an
  iPad in portrait. Accepted: the chip is small, the screens are center-composed, and the
  information is the change's entire point.

## Migration Plan

Purely additive UI: new component, new copy, three one-line render sites, spec/coordination text.
No data, no engines, no routing. Each step independently landable; the app works identically with
or without the chip rendered. Rollback is reverting the render sites (the component and copy become
dead code, the font subset simply carries unused glyphs until the next rebuild).
