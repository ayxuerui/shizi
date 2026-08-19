import type { Outcome } from "@shizi/learner-state";

export type GuessClassification = "confirming" | "inconclusive" | "miss";

export interface GuessDetectionConfig {
  /**
   * Mirrors `learner-state`'s `MasteryProjectionConfig.guessDetectionThresholdMs`
   * — deliberately sourced from the same default (see `types.ts`) so this
   * classifier's "confirming" reading and `computeMasteryStates`'s
   * two-consecutive-fast-correct rule can never silently drift apart.
   */
  fastThresholdMs: number;
}

/**
 * Per `assessment` spec's "Guess detection via confirmation and latency"
 * requirement: classifies a SINGLE response, independent of history.
 *
 * `computeMasteryStates` (learner-state) is the authority on whether a
 * character is actually `known` — it consumes the full event history's
 * consecutive-fast-correct streak, including the "a slow-correct response
 * breaks the streak" interpretation already decided there. This function
 * exists only for the per-response signal `session.ts` needs immediately
 * (frontier bracket updates via a miss, future UI hint) and deliberately
 * never reimplements that streak logic — see design.md.
 *
 * Note: design.md's "Guess detection thresholds" entry also names a
 * second, currently-unconsumed "slow" threshold (~3000ms) as a future
 * per-learner tuning knob. No spec'd behavior in this change reads a
 * three-way fast/slow/miss split — `computeMasteryStates` only checks
 * one cutoff — so this classifier only implements the two-way
 * confirming/inconclusive split that's actually spec'd, rather than
 * fabricating a third band nothing consumes yet.
 */
export function classifyResponse(
  outcome: Outcome,
  latencyMs: number,
  config: GuessDetectionConfig,
): GuessClassification {
  if (outcome === "incorrect") return "miss";
  return latencyMs < config.fastThresholdMs ? "confirming" : "inconclusive";
}
