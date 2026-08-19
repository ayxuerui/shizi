import type { Outcome } from "@shizi/learner-state";

export interface CalibrationConfig {
  /** Rolling-accuracy band this calibration holds the learner within. */
  targetBand: { lower: number; upper: number };
  /** How many of the most recent responses count toward rolling accuracy. */
  rollingWindowSize: number;
  /** Minimum samples in the window before accuracy is trusted enough to
   * adjust calibration — avoids overreacting to n=1-2 at session start. */
  minSamples: number;
  /** How much the confusability level moves per adjustment, clamped to [0, 1] overall. */
  step: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  // 80-85% per design.md/assessment spec's default target band.
  targetBand: { lower: 0.8, upper: 0.85 },
  rollingWindowSize: 10,
  minSamples: 4,
  step: 0.1,
};

/**
 * Rolling accuracy over the most recent responses, per `assessment`
 * spec's "Difficulty calibration (Loop 4)" requirement. Returns null
 * (rather than a possibly-noisy fraction) below `minSamples` — the same
 * "don't let n=1-2 drive an adjustment" caution design.md applies
 * elsewhere to early-sample-size adaptive loops.
 */
export function computeRollingAccuracy(
  recentOutcomes: readonly Outcome[],
  config: CalibrationConfig,
): number | null {
  const window = recentOutcomes.slice(-config.rollingWindowSize);
  if (window.length < config.minSamples) return null;
  const correct = window.filter((outcome) => outcome === "correct").length;
  return correct / window.length;
}

/**
 * Adjusts distractor confusability level (0 = loosest/least confusable,
 * 1 = tightest/most confusable) to hold rolling accuracy within the
 * target band — per the spec's "Accuracy above target band" (tighten)
 * and "Accuracy below target band" (loosen) scenarios. Holds steady
 * inside the band or when there isn't yet enough data to trust.
 */
export function nextConfusabilityLevel(
  currentLevel: number,
  rollingAccuracy: number | null,
  config: CalibrationConfig,
): number {
  if (rollingAccuracy === null) return currentLevel;
  if (rollingAccuracy > config.targetBand.upper) {
    return Math.min(1, currentLevel + config.step);
  }
  if (rollingAccuracy < config.targetBand.lower) {
    return Math.max(0, currentLevel - config.step);
  }
  return currentLevel;
}
