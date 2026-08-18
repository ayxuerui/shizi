import type { CandidatePool, CharacterAttributes } from "@shizi/character-data";
import type { MatchCriteria, MatchedPair } from "./types.js";

function confusabilityNeighborhoodSize(
  character: string,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  return confusabilityIndex.get(character)?.size ?? 0;
}

/**
 * Per `adaptivity-instrumentation` spec's "Matched-pair randomization
 * protocol" requirement: two characters are "matched" if they agree
 * exactly on concreteness (categorical — no tolerance makes sense for a
 * binary tag) and are within configured tolerance on stroke count,
 * frequency rank, and confusability-neighborhood size. Requires
 * concreteness/frequencyRank/strokeCount to be non-null on both —
 * candidates without those (task 3.3 pending) simply can't be matched
 * yet, which is correct: they're excluded from selection entirely
 * anyway (see character-data's exclusion.ts).
 */
export function isMatchedPair(
  a: CharacterAttributes,
  b: CharacterAttributes,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  criteria: MatchCriteria,
): boolean {
  if (a.character === b.character) return false;
  if (a.concreteness === null || a.concreteness !== b.concreteness) return false;
  if (a.strokeCount === null || b.strokeCount === null) return false;
  if (Math.abs(a.strokeCount - b.strokeCount) > criteria.strokeCountTolerance) return false;
  if (a.frequencyRank === null || b.frequencyRank === null) return false;
  if (Math.abs(a.frequencyRank - b.frequencyRank) > criteria.frequencyRankTolerance) return false;

  const aNeighbors = confusabilityNeighborhoodSize(a.character, confusabilityIndex);
  const bNeighbors = confusabilityNeighborhoodSize(b.character, confusabilityIndex);
  if (Math.abs(aNeighbors - bNeighbors) > criteria.confusabilityNeighborhoodTolerance) return false;

  return true;
}

/**
 * Greedily pairs not-yet-known candidates: each character is paired with
 * the first later candidate (in pool iteration order) it matches: with,
 * and each character appears in at most one pair. Deterministic given
 * the same pool/candidates/criteria — required for reproducible
 * randomization downstream (the pairing itself has no randomness; only
 * arm assignment, in assignment.ts, does).
 */
export function findMatchedPairs(
  pool: CandidatePool,
  notYetKnown: readonly string[],
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  criteria: MatchCriteria,
): MatchedPair[] {
  const paired = new Set<string>();
  const pairs: MatchedPair[] = [];

  for (let i = 0; i < notYetKnown.length; i++) {
    const characterA = notYetKnown[i]!;
    if (paired.has(characterA)) continue;
    const attributesA = pool.get(characterA);
    if (!attributesA) continue;

    for (let j = i + 1; j < notYetKnown.length; j++) {
      const characterB = notYetKnown[j]!;
      if (paired.has(characterB)) continue;
      const attributesB = pool.get(characterB);
      if (!attributesB) continue;

      if (isMatchedPair(attributesA, attributesB, confusabilityIndex, criteria)) {
        pairs.push({ characters: [characterA, characterB] });
        paired.add(characterA);
        paired.add(characterB);
        break;
      }
    }
  }

  return pairs;
}
