import type { CandidatePool, CharacterAttributes } from "@shizi/character-data";
import type { CurriculumState, ScoredCandidate, ScoringWeights } from "./types.js";

/**
 * SCOPE GAP, flagged rather than silently absorbed: the `curriculum`
 * spec calls for "potential words unlocked" as a scoring factor, but no
 * capability in this change provides word-level data (which compound
 * words a character participates in). `character-data`'s pool is
 * per-character only. CC-CEDICT (word-level entries) is license-cleared
 * per `data/PROVENANCE.md` but not yet integrated anywhere — that's a
 * real, separate data-sourcing task, not something to fabricate here.
 * Returns a neutral 0 for every candidate until that integration exists.
 */
function wordUnlockScore(_character: string, _pool: CandidatePool, _state: CurriculumState): number {
  return 0;
}

/**
 * SCOPE GAP, flagged rather than silently absorbed: "potential story
 * content unlocked" needs a story/episode corpus to check against, and
 * that corpus doesn't exist until the `printed-reader` change (design.md
 * phase P3) — explicitly out of scope for this change per proposal.md.
 * Returns a neutral 0 for every candidate until that change exists.
 */
function storyUnlockScore(_character: string, _pool: CandidatePool, _state: CurriculumState): number {
  return 0;
}

function personalRelevanceScore(attributes: CharacterAttributes): number {
  return attributes.personalRelevance ?? 0;
}

/**
 * Blends stroke-count simplicity (fewer strokes → easier) with a flat
 * bonus for pictographic origin (traditionally more memorable/motivating
 * regardless of stroke count) — a real, if simple, heuristic proxy.
 * This is explicitly a placeholder for Loop 3's learned model (design.md:
 * "instrument now, infer month 3+") — not the real thing, but not a
 * fabricated one either, since it's computed from real per-character data.
 */
function learnabilityScore(attributes: CharacterAttributes): number {
  const strokeCount = attributes.strokeCount;
  const pictographic = attributes.pictographic ?? false;

  const strokeSimplicity =
    strokeCount === null ? 0 : Math.max(0, 1 - (strokeCount - 1) / 19);
  const pictographicBonus = pictographic ? 1 : 0;

  return 0.5 * strokeSimplicity + 0.5 * pictographicBonus;
}

/**
 * Soft penalty (distinct from the hard recent-window constraint in
 * spacing.ts): candidates confusable with MANY already-known characters
 * score lower, reflecting general interference risk across the whole
 * known-set — not just the tight recent window the hard constraint
 * protects.
 */
function confusabilityPenaltyScore(
  character: string,
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const neighbors = confusabilityIndex.get(character);
  if (!neighbors) return 0;

  let confusableWithKnown = 0;
  for (const neighbor of neighbors) {
    if (state.knownSet.has(neighbor)) confusableWithKnown += 1;
  }
  return -confusableWithKnown;
}

/**
 * Scores one not-yet-known candidate, per `curriculum` spec's
 * "Scoring-based selection after Phase A" requirement. Pure function of
 * its inputs — required for the spec's "Selection is reproducible"
 * scenario.
 */
export function scoreCandidate(
  character: string,
  pool: CandidatePool,
  state: CurriculumState,
  weights: ScoringWeights,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
): ScoredCandidate {
  const attributes = pool.get(character);
  if (!attributes) {
    throw new Error(`scoreCandidate: "${character}" is not in the candidate pool`);
  }

  const factors = {
    wordUnlock: wordUnlockScore(character, pool, state),
    storyUnlock: storyUnlockScore(character, pool, state),
    personalRelevance: personalRelevanceScore(attributes),
    learnability: learnabilityScore(attributes),
    confusabilityPenalty: confusabilityPenaltyScore(character, state, confusabilityIndex),
  };

  const score =
    weights.wordUnlock * factors.wordUnlock +
    weights.storyUnlock * factors.storyUnlock +
    weights.personalRelevance * factors.personalRelevance +
    weights.learnability * factors.learnability +
    weights.confusabilityPenalty * factors.confusabilityPenalty;

  return { character, score, factors };
}
