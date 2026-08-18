import type { CandidatePool } from "@shizi/character-data";
import { isUsable } from "@shizi/character-data";
import { isPhaseAExhausted, selectFromPhaseA } from "./phase-a.js";
import { scoreCandidate } from "./scoring.js";
import { filterBySpacing } from "./spacing.js";
import {
  DEFAULT_CURRICULUM_CONFIG,
  type CurriculumConfig,
  type CurriculumState,
  type SelectionResult,
} from "./types.js";

/**
 * Selects the next character to introduce, per `curriculum` spec:
 * draws from Phase A until exhausted, then scoring-based selection
 * (Phase B) with the hard confusability-spacing constraint applied
 * before scoring is consulted. Pure function of its inputs — see the
 * spec's "Selection is reproducible" scenario and the determinism tests.
 */
export function selectNextCharacter(
  pool: CandidatePool,
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  config: CurriculumConfig = DEFAULT_CURRICULUM_CONFIG,
): SelectionResult {
  if (!isPhaseAExhausted(state)) {
    const character = selectFromPhaseA(state);
    // isPhaseAExhausted being false guarantees selectFromPhaseA is non-null.
    return { status: "phase-a", character: character! };
  }

  const notYetKnown: string[] = [];
  for (const [character, attributes] of pool) {
    if (state.knownSet.has(character)) continue;
    if (!isUsable(attributes)) continue; // per character-data's exclusion rules
    notYetKnown.push(character);
  }

  const eligible = filterBySpacing(notYetKnown, state, confusabilityIndex, config.recentWindowSize);

  if (eligible.length === 0) {
    return {
      status: "none-eligible",
      reason:
        notYetKnown.length === 0
          ? "no not-yet-known, usable candidates remain in the pool"
          : "every not-yet-known, usable candidate is confusable with a recently-introduced character",
    };
  }

  const scored = eligible.map((character) =>
    scoreCandidate(character, pool, state, config.weights, confusabilityIndex),
  );
  scored.sort((a, b) => b.score - a.score || a.character.localeCompare(b.character));

  const top = scored[0]!;
  return { status: "phase-b", character: top.character, scored: top };
}
