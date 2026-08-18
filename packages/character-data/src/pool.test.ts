import { describe, expect, it } from "vitest";
import { assembleCandidatePool, IDENTITY_SET, PHASE_A_SEQUENCE } from "./pool.js";

describe("assembleCandidatePool", () => {
  const pool = assembleCandidatePool();

  it("stays within the preschool-appropriate bound (character-data spec: 'Bounded candidate pool')", () => {
    // ~200 productive + 6 identity, per the pool assembled in task 3.1.
    expect(pool.size).toBeGreaterThan(150);
    expect(pool.size).toBeLessThan(300);
  });

  it("includes every identity-set character", () => {
    for (const { character } of IDENTITY_SET) {
      expect(pool.has(character)).toBe(true);
    }
  });

  it("includes every Phase A character", () => {
    for (const character of PHASE_A_SEQUENCE) {
      expect(pool.has(character)).toBe(true);
    }
  });

  it("populates real stroke data for a known character", () => {
    const entry = pool.get("山");
    expect(entry).toBeDefined();
    expect(entry!.strokeCount).toBe(3);
    expect(entry!.strokeData).not.toBeNull();
    expect(entry!.strokeData!.strokes).toHaveLength(3);
    expect(entry!.strokeData!.medians).toHaveLength(3);
  });

  it("leaves concreteness and pictographic null pending the hand-tagging pass (task 3.3)", () => {
    // This is intentional current state, not a bug — see exclusion.ts.
    const entry = pool.get("山");
    expect(entry!.concreteness).toBeNull();
    expect(entry!.pictographic).toBeNull();
  });

  it("leaves frequencyRank null for characters outside the HSK1 source (e.g. thematic additions)", () => {
    const wukong = pool.get("悟");
    expect(wukong).toBeDefined();
    expect(wukong!.frequencyRank).toBeNull();
  });

  it("populates frequencyRank for HSK1-sourced characters", () => {
    const entry = pool.get("爱"); // rank 1 in the HSK1 source list
    expect(entry!.frequencyRank).toBe(1);
  });

  it("seeds personalRelevance for thematic/family characters, 0 for everything else", () => {
    expect(pool.get("悟")!.personalRelevance).toBeGreaterThan(0);
    expect(pool.get("妈")!.personalRelevance).toBeGreaterThan(0);
    expect(pool.get("山")!.personalRelevance).toBe(0);
  });
});
