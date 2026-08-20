## Context

See `proposal.md` for motivation. The relevant existing mechanics:

- `apps/assessment/src/copy.ts`'s header comment states the invariant this whole file exists to enforce:
  every piece of Chinese UI text lives here, because `scripts/build-font-subset.ts` scans it (via
  `collectCopyCharacters()`) to build the subsetted font's required-character set. Text rendered anywhere
  else, without appearing here, shows as tofu once the subset font is the only font shipped.
- `collectCopyCharacters()` walks `COPY` recursively and iterates each string with `for (const char of value)`
  — a code-point iterator, not UTF-16 code units, so an astral emoji is added to the set as one character,
  not split into lone surrogates. There is no filter for "is this CJK" today, despite the function's own
  doc comment saying "Chinese/CJK character."
- `build-font-subset.ts`'s `ASCII_AND_PUNCTUATION` constant covers space, basic Latin, digits, and CJK/half-
  width punctuation — no emoji, no Misc Symbols. Before subsetting, the script verifies every required
  character actually exists in the source font (`sourceFont.charToGlyph(character)`); any character that
  resolves to the `.notdef` glyph (index 0) is fatal — the script `console.error`s and calls
  `process.exit(1)`. This is deliberate (design.md's own precedent: "a missing glyph fails the build loudly
  rather than shipping silent tofu"), and it is exactly what an unfiltered emoji in `COPY` would trigger,
  since LXGW WenKai (the source font) has no emoji glyphs at all.
- `styles/global.css` applies `--font-hanzi` (`"LXGW WenKai Subset", serif`) to the bare `body` selector —
  globally, not scoped to hanzi-specific spans. CSS font matching is per-character, so a glyph absent from
  both fonts in that stack (any emoji) simply falls through to the browser/OS's own emoji font. This part
  needs no code change — only the *build-time* requirement-scanning needs to change.
- `apps/assessment/src/components/TapTarget.tsx` already renders `aria-label={label}` and `{children}` as
  two fully independent things — `label` is never rendered as visible text. `ParentRatingPrompt.tsx`
  currently passes the same Chinese string to both for each button.

## Goals / Non-Goals

**Goals:**
- Replace the three rating buttons' visible glyph with an emoji, without breaking the font-subset build
  and without regressing accessibility.
- Keep every existing test passing, since they all query by accessible name (`COPY.parentRating.*`), not
  visible text.

**Non-Goals:**
- Changing the Skip button or the prompt sentence (see proposal.md's "What Changes" for why each is out of
  scope for this pass).
- Changing anything about how ratings are persisted, synced, or validated — this is presentation-only.
- A general-purpose emoji framework for the rest of the app. This change solves it narrowly for the rating
  buttons; if another screen wants emoji later, it can reuse the same exclusion mechanism.

## Decisions

**Keep `aria-label` as the existing Chinese text; only `children` (the visible glyph) changes.** Since
`TapTarget` already treats these as independent props, this costs nothing to implement and avoids a real
regression: an emoji-only accessible name would make VoiceOver announce the OS's locale-dependent CLDR
description of the glyph (e.g. "smiling face with heart-eyes, button") instead of a real rating
description — non-deterministic across devices and system languages, and not descriptive of the action
being taken. **Alternative considered and rejected:** using the emoji as `aria-label` too, for a
"what you see is what's announced" purity — rejected because CLDR emoji names are not written to double as
UI copy (they describe the glyph shape, not its intended meaning here) and are locale-dependent in a way
this app's other accessible names are not.

**Exclude emoji from the font-subset requirement set, rather than accepting the build failure or working
around it per-character.** Concretely: `collectCopyCharacters()` (or `build-font-subset.ts`'s consumption
of it) skips any code point outside the CJK/ASCII ranges the subset already targets. **Alternatives
considered:** (a) leave `COPY` as the single source of truth and let the build fail, fixing it manually
each time — rejected, this is the "latent trap" the proposal specifically calls out, since the committed
subset artifact keeps working until the next regeneration, at which point a future contributor hits a
build failure with no context. (b) keep the emoji entirely out of `COPY` (inline string literals in
`ParentRatingPrompt.tsx`) — rejected, this quietly breaks `copy.ts`'s own stated invariant ("every piece of
Chinese... UI text collected in one place") without documenting why, whereas an explicit, commented
exclusion keeps the invariant intact and legible for the next person who reads that file.

**`copy.ts`'s header comment and `collectCopyCharacters()`'s doc comment both need updating** to state the
new, narrower invariant precisely (something like: "every piece of Chinese UI text, PLUS any decorative
emoji, which are deliberately excluded from the font-subset scan since they render via system fallback").
Leaving the comments as-is after the code changes would make the file lie about its own contract.

## Risks / Trade-offs

- **[Risk]** Emoji rendering is entirely dependent on whatever the device ships — unlike the rest of this
  app's typography, it is not visually controlled or versioned. → **Mitigation:** accepted; this is
  parent-facing UI (not the child's hanzi-recognition surface, where `fonts.css`'s `font-display: block`
  choice specifically protects against a beginning reader seeing a character in more than one typeface
  before they've learned its shape) — the same reasoning doesn't apply here, and is worth stating
  explicitly rather than leaving a reviewer to wonder about the inconsistency.
- **[Risk]** An emoji-only glyph can be genuinely ambiguous about intended valence (e.g. 😕 read as
  "unhappy" vs. "confused" vs. "checked out"). → **Mitigation:** none required by this proposal's scope,
  but worth choosing glyphs during implementation that are as unambiguous as reasonably possible; not
  something automated tests can verify.
- **[Trade-off]** The font-subset exclusion is a small, permanent carve-out in a script whose whole design
  point was "one required-character set, computed from real usage, verified before subsetting." Accepted
  since the alternative (a build that silently breaks on the next font regeneration) is worse, and the
  carve-out is narrow and explicitly documented.
