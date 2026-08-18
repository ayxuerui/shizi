import type { CandidatePool, CharacterAttributes } from "./types.js";

/**
 * The five attributes `character-data` spec's "Per-character attributes"
 * requirement calls required. A character missing any of these is
 * excluded from curriculum selection and distractor selection until
 * supplied — this is correct, expected behavior for a pool under active
 * curation, not a bug to work around.
 */
const REQUIRED_FIELDS: ReadonlyArray<keyof CharacterAttributes> = [
  "frequencyRank",
  "concreteness",
  "pictographic",
  "strokeCount",
  "strokeData",
];

export function missingAttributes(entry: CharacterAttributes): Array<keyof CharacterAttributes> {
  return REQUIRED_FIELDS.filter((field) => entry[field] === null);
}

export function isUsable(entry: CharacterAttributes): boolean {
  return missingAttributes(entry).length === 0;
}

/** Splits a pool into characters ready for selection vs. not yet. */
export function partitionByUsability(pool: CandidatePool): {
  usable: CharacterAttributes[];
  excluded: Array<{ entry: CharacterAttributes; missing: Array<keyof CharacterAttributes> }>;
} {
  const usable: CharacterAttributes[] = [];
  const excluded: Array<{ entry: CharacterAttributes; missing: Array<keyof CharacterAttributes> }> =
    [];

  for (const entry of pool.values()) {
    const missing = missingAttributes(entry);
    if (missing.length === 0) {
      usable.push(entry);
    } else {
      excluded.push({ entry, missing });
    }
  }

  return { usable, excluded };
}
