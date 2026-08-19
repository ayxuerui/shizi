/**
 * A single Han character, e.g. "山". Not validated as exactly one code
 * point here — callers working with raw user/text input should validate
 * separately; within this package all data is authored as single chars.
 */
export type CharacterId = string;

/** Ordered stroke-path data, in Make Me a Hanzi's coordinate system. */
export interface StrokeData {
  /** SVG path `d` attribute per stroke, in stroke order. */
  strokes: string[];
  /** Per-stroke median point sequence, same order/length as `strokes`. */
  medians: Array<Array<[number, number]>>;
}

export type Concreteness = "concrete" | "abstract";

/**
 * Distinguishes a manually-reviewed tag from a generated draft one, per
 * `character-data` spec's "Human-supplied concreteness tag" scenario: a
 * manually supplied tag is authoritative, so a generated draft — however
 * carefully generated — must not be silently presented as one. Applies
 * to `concreteness`/`pictographic` jointly (see
 * `scripts/build-tags.mjs`); there is no per-field split.
 */
export type TagSource = "draft" | "reviewed";

/**
 * Per-character attributes. Fields are nullable because they are meant to
 * be filled in independently over time (stroke data mechanically, from
 * Make Me a Hanzi; concreteness/pictographic by hand — see
 * `character-data` spec's "Per-character attributes" requirement). A
 * character with any null required field is excluded from selection —
 * see `exclusion.ts`.
 */
export interface CharacterAttributes {
  character: CharacterId;
  /**
   * Lower is more frequent. Currently derived from a character's ordinal
   * position in the official HSK 3.0 Level 1 list (a real, licensed,
   * pedagogically-ordered source — see data/PROVENANCE.md) as a proxy;
   * not a raw corpus frequency count. Null for characters added outside
   * that list (e.g. thematic additions) until a real frequency source is
   * sourced for them.
   */
  frequencyRank: number | null;
  /** Human-tagged (task 3.3). Provisionally populated from a generated
   * draft (`tagSource: "draft"`) pending the parent's review — see
   * `scripts/build-tags.mjs`. Null only for characters absent from
   * `data/tagging-review.csv` entirely. */
  concreteness: Concreteness | null;
  /** Human-tagged (task 3.3). See `concreteness` above — same draft/null caveat applies. */
  pictographic: boolean | null;
  /** "draft" until the parent's hand-review lands; null if untagged at all. */
  tagSource: TagSource | null;
  strokeCount: number | null;
  strokeData: StrokeData | null;
  /**
   * Not one of the 5 required fields in the `character-data` spec's
   * "Per-character attributes" requirement — optional, defaults to
   * neutral (0) when absent. Added because `curriculum`'s scoring
   * function needs a personal-relevance factor and no field carried it.
   * Deliberately NOT part of the exclusion gate (see exclusion.ts) —
   * missing this never blocks a character from selection, it just means
   * that scoring factor doesn't distinguish it yet.
   */
  personalRelevance: number | null;
}

export type IdentityRole = "surname" | "given-name" | "nickname";

export interface IdentitySetEntry {
  character: CharacterId;
  role: IdentityRole;
}

/** A full candidate pool: attributes for every character, keyed by character. */
export type CandidatePool = ReadonlyMap<CharacterId, CharacterAttributes>;

/** A confusable relationship between two characters, with a reason. */
export interface ConfusablePair {
  a: CharacterId;
  b: CharacterId;
  reason: "curated" | "same-stroke-count-and-shape";
}
