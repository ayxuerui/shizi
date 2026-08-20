/**
 * Every piece of Chinese (and Chinese-adjacent) UI text this app renders,
 * collected in one place. This is deliberate, not just tidy: the
 * font-subset script (`scripts/build-font-subset.ts`) scans this file for
 * literal characters to include in the subsetted font, alongside the
 * candidate pool and identity set. Text added anywhere else in the app
 * without also appearing here will render as tofu (missing-glyph boxes)
 * once the subset font is the only font shipped — see that script's
 * header comment.
 *
 * Narrower invariant, as of the parent-rating emoji glyphs below: this
 * file also carries decorative emoji (`COPY.parentRating.*.glyph`), which
 * are DELIBERATELY EXCLUDED from `collectCopyCharacters()`'s scan (see
 * that function and `isEmojiCodePoint` below) — they render via the
 * platform's own emoji font, not the subsetted LXGW WenKai font, which
 * has no emoji glyphs at all and would fail the font-subset build if one
 * were included in its required-character set.
 */

export const COPY = {
  audioUnlock: {
    tapToStart: "点一下开始",
  },
  narrative: {
    // Placeholder narrative copy — flagged alongside WukongPlaceholder as
    // the thing real art/story direction replaces. "帮悟空" = "help
    // Wukong"; each beat names a small, concrete next step so a 4-year-old
    // has something to point at, not an abstract "keep going."
    goalPrefix: "帮悟空",
    goals: ["过河", "爬山", "找路", "开门", "找朋友", "回家"],
  },
  probe: {
    listenAgain: "再听一次",
  },
  closing: {
    title: "悟空到家了！",
    subtitle: "今天玩得真开心",
  },
  parentRating: {
    prompt: "今天玩得怎么样？",
    // `label` is the accessible name (aria-label, read by VoiceOver) —
    // deliberately kept as real Chinese text, not the emoji, so a screen
    // reader announces an actual rating description rather than the
    // device's locale-dependent CLDR name for the glyph (e.g. "smiling
    // face with heart-eyes"). `glyph` is the visible content. See
    // ParentRatingPrompt.tsx, where TapTarget already keeps these two
    // fully independent (label vs. children).
    loved: { label: "很喜欢", glyph: "😍" },
    fine: { label: "还可以", glyph: "🙂" },
    checkedOut: { label: "不太想玩", glyph: "😕" },
    skip: "跳过",
  },
} as const;

/**
 * Whether a code point falls in a commonly-used emoji block. Not an
 * exhaustive Unicode emoji-property check — narrow and deliberate: this
 * only needs to correctly exclude the small, fixed set of glyphs this
 * app actually uses (`COPY.parentRating.*.glyph` above), not classify
 * arbitrary Unicode.
 */
function isEmojiCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) || // pictographs, emoticons, transport, supplemental symbols
    (codePoint >= 0x2600 && codePoint <= 0x27bf) || // misc symbols, dingbats
    codePoint === 0xfe0f || // variation selector-16 (emoji presentation)
    codePoint === 0x200d // zero-width joiner (multi-codepoint emoji sequences)
  );
}

/** Every literal Chinese/CJK character used anywhere in `COPY`, deduped —
 * consumed directly by the font-subset script. Not identity/pool
 * characters (those come from `@shizi/character-data`) — just this
 * file's own UI copy. Decorative emoji (see `isEmojiCodePoint` above) are
 * deliberately excluded: they render via the platform's own emoji font,
 * and including one here would fail the font-subset build against LXGW
 * WenKai, which has no emoji glyphs at all. */
export function collectCopyCharacters(): Set<string> {
  const characters = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const char of value) {
        if (!isEmojiCodePoint(char.codePointAt(0)!)) characters.add(char);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(COPY);
  return characters;
}
