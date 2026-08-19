import type { CandidatePool } from "@shizi/character-data";

export interface RandomDeps {
  /** [0, 1) uniform random source — every use of randomness in this package goes through this. */
  random: () => number;
}

/** Deterministic Fisher-Yates shuffle driven entirely by the injected random source. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * Selects `count` distractors for `target`, per `assessment` spec's
 * "Difficulty calibration (Loop 4)" requirement: at a high confusability
 * `level` (near 1), prefers `target`'s confusable neighbors (per
 * `character-data`'s confusability index) — visually harder to tell
 * apart; at a low level (near 0), prefers non-confusable pool
 * characters. A target with few or no confusable neighbors still gets a
 * full option set — the non-preferred group fills in whatever the
 * preferred group can't supply, it's never left short.
 */
export function pickDistractors(
  target: string,
  pool: CandidatePool,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  level: number,
  count: number,
  deps: RandomDeps,
): string[] {
  const neighbors = confusabilityIndex.get(target) ?? new Set<string>();
  const others = [...pool.keys()].filter((character) => character !== target);
  const confusable = others.filter((character) => neighbors.has(character));
  const nonConfusable = others.filter((character) => !neighbors.has(character));

  const preferConfusableFirst = level >= 0.5;
  const primary = preferConfusableFirst ? confusable : nonConfusable;
  const secondary = preferConfusableFirst ? nonConfusable : confusable;

  const ordered = [...shuffled(primary, deps.random), ...shuffled(secondary, deps.random)];
  return ordered.slice(0, count);
}
