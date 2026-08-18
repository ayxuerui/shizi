import type { CurriculumState } from "./types.js";

/**
 * Per `curriculum` spec's "Confusability spacing is a hard constraint"
 * requirement: true if `character` is confusable with anything in the
 * recent window, regardless of score. Distinct from scoring.ts's soft
 * confusability penalty, which considers the whole known-set, not just
 * the recent window.
 */
export function violatesSpacingConstraint(
  character: string,
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const neighbors = confusabilityIndex.get(character);
  if (!neighbors) return false;

  return state.recentlyIntroduced.some((recent) => neighbors.has(recent));
}

/** Filters candidates down to those that don't violate the recent-window spacing constraint. */
export function filterBySpacing(
  candidates: readonly string[],
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  recentWindowSize: number,
): string[] {
  const windowedState: CurriculumState = {
    ...state,
    recentlyIntroduced: state.recentlyIntroduced.slice(-recentWindowSize),
  };
  return candidates.filter(
    (character) => !violatesSpacingConstraint(character, windowedState, confusabilityIndex),
  );
}
