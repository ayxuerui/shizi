import { describe, expect, it } from "vitest";
import { assembleCandidatePool, isUsable } from "@shizi/character-data";
import { computeDifficultyIndex } from "./difficulty.js";

const pool = assembleCandidatePool();

describe("computeDifficultyIndex", () => {
  const difficulty = computeDifficultyIndex(pool);

  it("assigns a value only to usable characters", () => {
    for (const [character, attributes] of pool) {
      expect(difficulty.has(character)).toBe(isUsable(attributes));
    }
  });

  it("every value is within [0, 1]", () => {
    for (const value of difficulty.values()) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("scores a rarer, higher-stroke character as harder than a common, low-stroke one", () => {
    // 一 (rank 262 per pool-membership.ts, 1 stroke) vs 爱 (rank 1, more strokes).
    const common = difficulty.get("爱")!;
    const rare = difficulty.get("一")!;
    expect(rare).toBeGreaterThan(common);
  });

  it("is deterministic — repeated calls on the same pool produce identical output", () => {
    expect(computeDifficultyIndex(pool)).toEqual(difficulty);
  });
});
