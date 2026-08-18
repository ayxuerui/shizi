/**
 * Interpretation decision: the whitelist/repetition/density rules only
 * apply to actual Han characters — punctuation, whitespace, and any
 * other code points are always permitted and never counted. The
 * validator's purpose is bounding what a learner needs to *recognize*,
 * and punctuation isn't a literacy target the same way 汉字 are.
 *
 * Range covers CJK Unified Ideographs (the overwhelming majority of
 * simplified Chinese text) plus the Extension A block, matching what
 * `character-data`'s pool draws from.
 */
export function isHanCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) // CJK Extension A
  );
}

/** Splits text into individual characters with their index, filtering to Han characters only. */
export function hanCharacterOccurrences(text: string): Array<{ character: string; index: number }> {
  const occurrences: Array<{ character: string; index: number }> = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (isHanCharacter(char)) {
      occurrences.push({ character: char, index: i });
    }
  }
  return occurrences;
}
