## Why

The parent end-of-session rating buttons currently show Chinese text ("很喜欢" / "还可以" / "不太想玩").
An emoji face for each option is faster to scan at a glance than reading three short phrases, and better
matches the emotional-valence nature of the choice (loved it / fine / checked out) than a text label does.

## What Changes

- The three rating buttons (loved / fine / checked-out) show an emoji as their visible glyph instead of
  the current Chinese text. The Skip control is unchanged (kept as text — "跳过" is a navigational action,
  not an emotional-valence choice, so an emoji face doesn't fit it the way it fits the other three). The
  end-of-session prompt sentence ("今天玩得怎么样？") is unchanged (a whole sentence has no natural
  single-emoji replacement).
- The accessible name (`aria-label`, read by VoiceOver) for each button **stays the existing Chinese text**
  — only the visible glyph changes. An emoji-only accessible name would make VoiceOver announce the
  device's locale-dependent CLDR name for the glyph (e.g. "smiling face with heart-eyes") instead of a real
  rating description, which is non-deterministic across devices/languages — a real accessibility
  regression, not a stylistic detail. `TapTarget`, the shared component every tap target in this app
  renders through, already keeps `aria-label` and visible content as two independent props, so this needs
  no change to that component at all.
- The font-subset build script (`scripts/build-font-subset.ts`) is updated so emoji are explicitly excluded
  from its required-character set. Today, `copy.ts`'s `collectCopyCharacters()` feeds every string in
  `COPY` — unfiltered, by Unicode code point — into that script's required set, and the script treats a
  required character missing from the source font (LXGW WenKai, which has no emoji glyphs) as a fatal
  build error (`process.exit(1)`), not silent tofu. Without this exclusion, adding an emoji to `COPY` would
  make `npm run build:font` fail the next time anyone regenerates the subset — a latent trap rather than an
  immediate, obvious break.
- **Not a breaking change.** The `Rating` type and its `"loved" | "fine" | "checked-out"` wire
  values (used for persistence and sync, see `bootstrap-shizi-assessment`'s Section 10 work) are unchanged
  — this is a display-only change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none — this is a presentation/asset change. The `adaptivity-instrumentation` spec's "Parent one-tap
session rating" requirement describes the interaction — one tap, linked to the session, skippable — not
the visual label used for each choice, so no requirement text changes.)

## Impact

- `apps/assessment/src/copy.ts` — restructure `COPY.parentRating`'s three rating entries to carry both a
  Chinese label (kept, for `aria-label`) and an emoji glyph (new, for visible content); update the file's
  header comment, since it currently states an invariant ("every literal Chinese/CJK character... consumed
  directly by the font-subset script") that becomes conditional once emoji are excluded from that scan.
- `apps/assessment/scripts/build-font-subset.ts` (and/or `copy.ts`'s `collectCopyCharacters()`) — exclude
  emoji/non-CJK code points from the required-character set.
- `apps/assessment/src/parent/ParentRatingPrompt.tsx` — three `TapTarget` call sites: `label` stays the
  Chinese string (unchanged), visible `children` becomes the emoji glyph.
- `apps/assessment/src/parent/ParentRatingPrompt.test.tsx` — add coverage asserting the rendered glyph is
  the emoji (currently a real gap: existing tests assert only accessible names, never visible text).
- Untouched: `TapTarget.tsx`, `styles/tokens.css`, `styles/global.css`, `styles/fonts.css`, the `Rating`
  type and its persistence/sync path.
