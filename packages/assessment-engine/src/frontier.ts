import type { CandidatePool } from "@shizi/character-data";
import { isUsable } from "@shizi/character-data";
import type { LearnerEvent } from "@shizi/learner-state";

export interface FrontierBounds {
  /** Difficulty of the hardest character confirmed `known`/`shaky` so far (session + prior history), or null if none yet. */
  knownFloor: number | null;
  /** Difficulty of the easiest not-yet-known character with at least one miss, or null if none yet. */
  unknownCeiling: number | null;
}

/**
 * Per `assessment` spec's "Coarse probing before narrowing" and
 * "Narrowing around the discovered frontier" scenarios: derives the
 * current bracket directly from the full event history (prior sessions +
 * this session so far), not from session-local state alone. That means a
 * first-ever session (no history) naturally starts coarse, and a
 * returning session with an established history starts already narrowed
 * — one function, no special-casing "first session" vs "Nth session".
 */
export function computeFrontierBounds(
  events: readonly LearnerEvent[],
  knownCharacters: ReadonlySet<string>,
  difficultyIndex: ReadonlyMap<string, number>,
): FrontierBounds {
  let knownFloor: number | null = null;
  for (const character of knownCharacters) {
    const difficulty = difficultyIndex.get(character);
    if (difficulty === undefined) continue;
    if (knownFloor === null || difficulty > knownFloor) knownFloor = difficulty;
  }

  let unknownCeiling: number | null = null;
  for (const event of events) {
    if (event.outcome !== "incorrect") continue;
    if (knownCharacters.has(event.character)) continue;
    const difficulty = difficultyIndex.get(event.character);
    if (difficulty === undefined) continue;
    if (unknownCeiling === null || difficulty < unknownCeiling) unknownCeiling = difficulty;
  }

  return { knownFloor, unknownCeiling };
}

export interface FrontierCandidate {
  character: string;
  difficulty: number;
}

/** Usable, not-yet-known productive candidates, ordered by difficulty ascending. */
export function buildFrontierCandidates(
  pool: CandidatePool,
  knownCharacters: ReadonlySet<string>,
  difficultyIndex: ReadonlyMap<string, number>,
): FrontierCandidate[] {
  const candidates: FrontierCandidate[] = [];
  for (const [character, attributes] of pool) {
    if (knownCharacters.has(character)) continue;
    if (!isUsable(attributes)) continue;
    const difficulty = difficultyIndex.get(character);
    if (difficulty === undefined) continue;
    candidates.push({ character, difficulty });
  }
  candidates.sort((a, b) => a.difficulty - b.difficulty || a.character.localeCompare(b.character));
  return candidates;
}

/**
 * Coarse-quantile cycling order: spreads probes across the whole
 * difficulty range before narrowing, per the "Coarse probing before
 * narrowing" scenario. Deterministic (no randomness) — cycles through a
 * fixed set of quantile positions so repeated calls with the same
 * `roundIndex` sequence always produce the same probe sequence, matching
 * this project's "Selection is reproducible" discipline (see
 * `curriculum`'s determinism tests).
 */
const COARSE_QUANTILES: readonly number[] = [0.5, 0.05, 0.95, 0.25, 0.75];

function pickCoarseCandidate(
  candidates: readonly FrontierCandidate[],
  roundIndex: number,
): FrontierCandidate {
  const quantile = COARSE_QUANTILES[roundIndex % COARSE_QUANTILES.length]!;
  const index = Math.min(candidates.length - 1, Math.floor(quantile * candidates.length));
  return candidates[index]!;
}

/**
 * Picks the single most informative next frontier probe: the usable,
 * not-yet-known candidate whose difficulty sits closest to the midpoint
 * of the bracketed `[knownFloor, unknownCeiling]` band once both bounds
 * are known; before that, cycles coarse quantile positions across the
 * whole range (per `computeFrontierBounds`'s doc, this naturally covers
 * both the "no prior knowledge" and "returning learner" cases). Returns
 * null only if no usable, not-yet-known candidate remains at all.
 */
export function selectNextFrontierProbe(
  candidates: readonly FrontierCandidate[],
  bounds: FrontierBounds,
  roundIndex: number,
): FrontierCandidate | null {
  if (candidates.length === 0) return null;

  if (bounds.knownFloor === null || bounds.unknownCeiling === null) {
    return pickCoarseCandidate(candidates, roundIndex);
  }

  const knownFloor = bounds.knownFloor;
  const unknownCeiling = bounds.unknownCeiling;
  const inBand = candidates.filter((c) => c.difficulty >= knownFloor && c.difficulty <= unknownCeiling);
  const searchSpace = inBand.length > 0 ? inBand : candidates;
  const midpoint = (knownFloor + unknownCeiling) / 2;

  let best = searchSpace[0]!;
  let bestDistance = Math.abs(best.difficulty - midpoint);
  for (const candidate of searchSpace) {
    const distance = Math.abs(candidate.difficulty - midpoint);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
