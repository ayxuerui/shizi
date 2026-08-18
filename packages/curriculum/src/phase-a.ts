import { PHASE_A_SEQUENCE } from "@shizi/character-data";
import type { CurriculumState } from "./types.js";

/**
 * Per `curriculum` spec's "Fixed Phase A sequence precedes scoring"
 * requirement: draws the next not-yet-known character from the fixed
 * sequence, skipping any already known (covers both the "early
 * sequencing" and "already known via assessment" scenarios — they're
 * the same skip logic).
 */
export function selectFromPhaseA(state: CurriculumState): string | null {
  for (const character of PHASE_A_SEQUENCE) {
    if (!state.knownSet.has(character)) {
      return character;
    }
  }
  return null;
}

/** True once every Phase A character is known — the transition point to Phase B. */
export function isPhaseAExhausted(state: CurriculumState): boolean {
  return selectFromPhaseA(state) === null;
}
