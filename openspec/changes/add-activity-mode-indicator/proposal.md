## Why

The play loop rotates three modules (learn → assess → review) and delivers exposure through two
randomized arms (listen / trace), but nothing on screen says which one is running. A supervising
parent watching the child play cannot tell teaching from measurement from review, and cannot see
which activity the adaptivity loop actually assigned — that information exists only in the event
log and the assignment records after the fact. As the rotation grows (review is new, more activities
are planned), "what is she doing right now?" becomes unanswerable by watching.

## What Changes

- **A persistent, bilingual activity-mode indicator on every activity screen** — a small, muted
  chip identifying the running module and, where one exists, the activity that delivers it:
  `学 LEARN · 听 LISTEN`, `学 LEARN · 描 TRACE`, `测 ASSESS · 听选 HEAR-TAP`, `复习 REVIEW · 听选 HEAR-TAP`.
- **Parent-facing chrome discipline, stated as spec**: the indicator is purely graphical text —
  no digits, no percentages, no score-like or countdown semantics — and is styled to read as
  grown-up chrome (muted, corner-positioned), not child content. It extends the assessment spec's
  existing "no visible scoring" guarantee to this new element rather than weakening it.
- **Bilingual labels** (user decision): English module word + Chinese equivalent, so the label is
  legible to the supervising parent while remaining visually distinct from the app's child-facing
  Chinese copy. New glyphs enter `copy.ts` and require a font-subset rebuild.
- **One shared component across all three activity screens**, with the requirement text landing in
  each activity's owning capability. `assessment` is spec'd here; `exposure` and `memory-review`
  are owned by still-active changes (`add-tracing-modality-arm`, `add-layered-learning-architecture`),
  so this change adds the matching one-sentence requirement to those deltas rather than defining a
  second copy — same coordination pattern `add-layered-learning-architecture` task 8.5 already uses.

## Capabilities

### New Capabilities

(none — the indicator is a property of each activity's screen, not its own capability)

### Modified Capabilities

- `assessment`: gains an ADDED requirement — the bout screen identifies the running module and the
  activity it delivers, with persistent, purely-graphical bilingual text, without introducing any digit or
  score-like element.

## Impact

- **App**: `apps/assessment` — new shared indicator component rendered by `BoutScreen`,
  `ExposureScreen`, `MemoryScreen`; `copy.ts` gains the label strings; font subset rebuilt
  (学/描/听/测/复/习/听选 etc. — verified against `collectCopyCharacters()`).
- **Specs**: `openspec/specs/assessment/spec.md` via this change's delta; coordination edits to
  `add-tracing-modality-arm`'s `exposure` delta and `add-layered-learning-architecture`'s
  `memory-review` delta (one added sentence each).
- **No engine, event-schema, or adaptivity changes** — the indicator reads only what the screen
  already knows (its own module and activity); it writes nothing and derives nothing.
- **Sequencing**: independent of all active changes; the coordination edits touch planning
  artifacts only. Coexists with the in-flight tap-to-continue working-tree edits on the same
  screens (both are display-level; land in either order).
