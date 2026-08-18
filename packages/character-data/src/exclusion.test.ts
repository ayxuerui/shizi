import { describe, expect, it } from "vitest";
import { assembleCandidatePool } from "./pool.js";
import { isUsable, missingAttributes, partitionByUsability } from "./exclusion.js";

describe("exclusion (character-data spec: 'Missing attribute blocks use')", () => {
  const pool = assembleCandidatePool();

  it("currently excludes every character, since concreteness/pictographic tagging (task 3.3) hasn't happened yet", () => {
    // This is the correct, expected state right now — not a bug.
    const { usable, excluded } = partitionByUsability(pool);
    expect(usable).toHaveLength(0);
    expect(excluded.length).toBe(pool.size);
  });

  it("reports concreteness and pictographic as the missing fields for a character with real stroke data", () => {
    const entry = pool.get("山")!;
    expect(isUsable(entry)).toBe(false);
    expect(missingAttributes(entry)).toEqual(
      expect.arrayContaining(["concreteness", "pictographic"]),
    );
    // Stroke data and frequency ARE present for this character.
    expect(missingAttributes(entry)).not.toContain("strokeData");
    expect(missingAttributes(entry)).not.toContain("strokeCount");
    expect(missingAttributes(entry)).not.toContain("frequencyRank");
  });

  it("reports an additional missing frequencyRank for characters outside the HSK1 source", () => {
    const entry = pool.get("悟")!;
    expect(missingAttributes(entry)).toEqual(
      expect.arrayContaining(["frequencyRank", "concreteness", "pictographic"]),
    );
  });

  it("would mark a character usable once every required field is supplied", () => {
    const entry = pool.get("山")!;
    const completed = { ...entry, concreteness: "concrete" as const, pictographic: true };
    expect(isUsable(completed)).toBe(true);
  });
});
