import type { MasteryState } from "./types.js";

/**
 * Derives the known-set from mastery state, per task 4.4.
 *
 * Interpretation decision: includes both `known` AND `shaky` characters,
 * not just `known`. Rationale, per design.md and the `content-validator`
 * spec's shaky-seeding advisory: a `shaky` character is one she's
 * learned before and is due for review, not one she's never learned —
 * "the story IS the review mechanism" only works if shaky characters
 * remain usable in generated text. Excluding them from the known-set
 * would contradict that design intent.
 */
export function computeKnownSet(masteryStates: ReadonlyMap<string, MasteryState>): Set<string> {
  const known = new Set<string>();
  for (const [character, state] of masteryStates) {
    if (state === "known" || state === "shaky") {
      known.add(character);
    }
  }
  return known;
}
