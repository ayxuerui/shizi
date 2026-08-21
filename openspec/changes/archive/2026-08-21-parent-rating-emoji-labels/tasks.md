## 1. Exclude emoji from the font-subset build

- [x] 1.1 In `apps/assessment/src/copy.ts`'s `collectCopyCharacters()` (or in
      `apps/assessment/scripts/build-font-subset.ts`'s consumption of it), exclude non-CJK/astral code
      points from the set fed into the font-subset requirement check — pick whichever location keeps the
      exclusion rule in exactly one place, with a comment explaining why (emoji render via system fallback,
      not the subsetted font; leaving them in the required set fails the build against LXGW WenKai, which
      has no emoji glyphs). Implemented as `isEmojiCodePoint()` inside `collectCopyCharacters()` itself.
- [x] 1.2 Update `copy.ts`'s header comment and `collectCopyCharacters()`'s own doc comment to state the
      narrower invariant precisely — this file collects Chinese UI text (subsetted) plus any decorative
      emoji (deliberately excluded from that scan).
- [x] 1.3 Verify: run `npm run build:font` (or the equivalent workspace script) after adding an emoji to
      `COPY` (task 2.1) and confirm it succeeds — this is the actual regression test for this section, not
      just a unit test of the filter function in isolation. Verified for real: downloaded the exact source
      TTF this script's own header comment documents (already `data/PROVENANCE.md`-cleared), ran
      `npm run build:font -- <path>` with the three emoji glyphs live in `COPY`, and it succeeded. The
      output was byte-identical to the previously-committed subset (305 characters, 60256 bytes, same
      `.woff2` binary — only the `generatedAt` timestamp differed, which was reverted) — proof the emoji
      were excluded from the requirement set without dropping or altering any real character.

## 2. Update the rating copy and component

- [x] 2.1 In `apps/assessment/src/copy.ts`, restructure `COPY.parentRating`'s `loved`/`fine`/`checkedOut`
      entries to carry both the existing Chinese label (kept, unchanged value) and a new emoji glyph — e.g.
      `{ label: "很喜欢", glyph: "😍" }` per entry. Leave `prompt` and `skip` as plain strings, unchanged.
- [x] 2.2 In `apps/assessment/src/parent/ParentRatingPrompt.tsx`, update the three affected `TapTarget` call
      sites: `label` prop continues to receive the Chinese string (unchanged accessible name); the visible
      `<span>` child renders the emoji glyph instead of the Chinese text. The Skip button's call site is
      unchanged.

## 3. Test coverage

- [x] 3.1 In `apps/assessment/src/parent/ParentRatingPrompt.test.tsx`, add assertions on the rendered
      visible glyph (e.g. `expect(button).toHaveTextContent("😍")`) for all three rating buttons — this is
      currently a real gap: existing tests assert only accessible names, never visible text.
- [x] 3.2 Confirm existing tests in `ParentRatingPrompt.test.tsx` and the `COPY.parentRating.*`-referenced
      assertions in `apps/assessment/src/bout/BoutScreen.test.tsx` still pass — updated to append `.label`
      at the two call sites that referenced the (now-restructured) `COPY.parentRating.loved`/`.fine`/
      `.checkedOut` directly as strings (`ParentRatingPrompt.test.tsx`, `BoutScreen.test.tsx`); every
      assertion still queries by the identical accessible-name string, unchanged in value.
- [x] 3.3 Run `npm run lint && npm run typecheck && npm test && npm run build` from the repo root and
      `openspec validate parent-rating-emoji-labels --strict`. Verified: 365 tests pass workspace-wide,
      lint/typecheck/build all clean, validate passes.
