import { describe, expect, it } from "vitest";
import type { Outcome } from "@shizi/learner-state";
import { computeRollingAccuracy, nextConfusabilityLevel, DEFAULT_CALIBRATION_CONFIG } from "./calibration.js";

function outcomes(pattern: string): Outcome[] {
  // "c" = correct, "i" = incorrect, read left-to-right as oldest-to-newest.
  return [...pattern].map((c) => (c === "c" ? "correct" : "incorrect"));
}

describe("computeRollingAccuracy (assessment spec: 'Difficulty calibration (Loop 4)')", () => {
  it("returns null below the configured minimum sample count", () => {
    expect(computeRollingAccuracy(outcomes("cc"), DEFAULT_CALIBRATION_CONFIG)).toBeNull();
  });

  it("computes the correct fraction once enough samples exist", () => {
    expect(computeRollingAccuracy(outcomes("cccc"), DEFAULT_CALIBRATION_CONFIG)).toBe(1);
    expect(computeRollingAccuracy(outcomes("ccci"), DEFAULT_CALIBRATION_CONFIG)).toBe(0.75);
  });

  it("only considers the most recent rollingWindowSize outcomes", () => {
    // 10 incorrect, then 10 correct — with a window of 10, only the correct ones count.
    const long = [...outcomes("iiiiiiiiii"), ...outcomes("cccccccccc")];
    expect(computeRollingAccuracy(long, DEFAULT_CALIBRATION_CONFIG)).toBe(1);
  });
});

describe("nextConfusabilityLevel", () => {
  it("scenario: accuracy above target band tightens (raises) confusability level", () => {
    const next = nextConfusabilityLevel(0.5, 0.95, DEFAULT_CALIBRATION_CONFIG);
    expect(next).toBeGreaterThan(0.5);
  });

  it("scenario: accuracy below target band loosens (lowers) confusability level", () => {
    const next = nextConfusabilityLevel(0.5, 0.5, DEFAULT_CALIBRATION_CONFIG);
    expect(next).toBeLessThan(0.5);
  });

  it("holds steady when accuracy is within the target band", () => {
    expect(nextConfusabilityLevel(0.5, 0.82, DEFAULT_CALIBRATION_CONFIG)).toBe(0.5);
  });

  it("holds steady when there isn't yet enough data to trust (null accuracy)", () => {
    expect(nextConfusabilityLevel(0.5, null, DEFAULT_CALIBRATION_CONFIG)).toBe(0.5);
  });

  it("clamps to [0, 1]", () => {
    expect(nextConfusabilityLevel(0.95, 0.99, DEFAULT_CALIBRATION_CONFIG)).toBe(1);
    expect(nextConfusabilityLevel(0.05, 0.1, DEFAULT_CALIBRATION_CONFIG)).toBe(0);
  });
});
