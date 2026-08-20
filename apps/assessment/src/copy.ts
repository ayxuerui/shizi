/**
 * Every piece of Chinese (and Chinese-adjacent) UI text this app renders,
 * collected in one place. This is deliberate, not just tidy: the
 * font-subset script (`scripts/build-font-subset.ts`) scans this file for
 * literal characters to include in the subsetted font, alongside the
 * candidate pool and identity set. Text added anywhere else in the app
 * without also appearing here will render as tofu (missing-glyph boxes)
 * once the subset font is the only font shipped — see that script's
 * header comment.
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
    loved: "很喜欢",
    fine: "还可以",
    checkedOut: "不太想玩",
    skip: "跳过",
  },
} as const;

/** Every literal Chinese/CJK character used anywhere in `COPY`, deduped —
 * consumed directly by the font-subset script. Not identity/pool
 * characters (those come from `@shizi/character-data`) — just this
 * file's own UI copy. */
export function collectCopyCharacters(): Set<string> {
  const characters = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      for (const char of value) characters.add(char);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(COPY);
  return characters;
}
