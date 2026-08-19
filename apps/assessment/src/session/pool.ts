import { assembleCandidatePool, partitionByUsability } from "@shizi/character-data";
import type { CandidatePool } from "@shizi/character-data";

/**
 * The full candidate pool, assembled once for the app's lifetime.
 * `AssessmentSession` filters to usable characters internally for its
 * own frontier candidates — `partitionByUsability` is exposed here as
 * the future insertion point for task 9.4's published `config.json`
 * (e.g. a parent-facing "N characters still need tagging" indicator)
 * without redoing this wiring later.
 */
export function loadCandidatePool(): CandidatePool {
  return assembleCandidatePool();
}

export function candidatePoolUsability(pool: CandidatePool = loadCandidatePool()) {
  return partitionByUsability(pool);
}
