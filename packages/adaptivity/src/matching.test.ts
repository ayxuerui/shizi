import { describe, expect, it } from "vitest";
import type { CandidatePool, CharacterAttributes } from "@shizi/character-data";
import { findMatchedPairs, isMatchedPair } from "./matching.js";
import { DEFAULT_MATCH_CRITERIA } from "./types.js";

function attrs(character: string, overrides: Partial<CharacterAttributes> = {}): CharacterAttributes {
  return {
    character,
    frequencyRank: 100,
    concreteness: "concrete",
    pictographic: false,
    tagSource: "reviewed",
    strokeCount: 5,
    strokeData: null,
    personalRelevance: 0,
    ...overrides,
  };
}

describe("isMatchedPair (adaptivity-instrumentation spec: 'Matched-pair randomization protocol')", () => {
  const noConfusability = new Map<string, ReadonlySet<string>>();

  it("matches two characters with identical attributes", () => {
    const a = attrs("山");
    const b = attrs("水");
    expect(isMatchedPair(a, b, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(true);
  });

  it("does not match a character with itself", () => {
    const a = attrs("山");
    expect(isMatchedPair(a, a, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });

  it("requires exact concreteness agreement — no tolerance for a categorical field", () => {
    const a = attrs("山", { concreteness: "concrete" });
    const b = attrs("水", { concreteness: "abstract" });
    expect(isMatchedPair(a, b, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });

  it("does not match when either concreteness is null (not yet tagged)", () => {
    const a = attrs("山", { concreteness: null });
    const b = attrs("水", { concreteness: null });
    expect(isMatchedPair(a, b, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });

  it("respects stroke-count tolerance", () => {
    const a = attrs("山", { strokeCount: 5 });
    const withinTolerance = attrs("水", { strokeCount: 7 }); // diff 2, tolerance 2
    const outsideTolerance = attrs("好", { strokeCount: 8 }); // diff 3
    expect(isMatchedPair(a, withinTolerance, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(true);
    expect(isMatchedPair(a, outsideTolerance, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });

  it("respects frequency-rank tolerance", () => {
    const a = attrs("山", { frequencyRank: 100 });
    const withinTolerance = attrs("水", { frequencyRank: 125 }); // diff 25, tolerance 30
    const outsideTolerance = attrs("好", { frequencyRank: 140 }); // diff 40
    expect(isMatchedPair(a, withinTolerance, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(true);
    expect(isMatchedPair(a, outsideTolerance, noConfusability, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });

  it("respects confusability-neighborhood-size tolerance", () => {
    const confusabilityIndex = new Map<string, ReadonlySet<string>>([
      ["山", new Set(["A", "B", "C"])], // 3 neighbors
      ["水", new Set(["D", "E"])], // 2 neighbors, diff 1, within tolerance
      ["好", new Set(["F"])], // 1 neighbor, diff 2, outside tolerance
    ]);
    const a = attrs("山");
    expect(isMatchedPair(a, attrs("水"), confusabilityIndex, DEFAULT_MATCH_CRITERIA)).toBe(true);
    expect(isMatchedPair(a, attrs("好"), confusabilityIndex, DEFAULT_MATCH_CRITERIA)).toBe(false);
  });
});

describe("findMatchedPairs", () => {
  const noConfusability = new Map<string, ReadonlySet<string>>();

  function poolOf(entries: CharacterAttributes[]): CandidatePool {
    return new Map(entries.map((e) => [e.character, e]));
  }

  it("pairs matching candidates and leaves each character in at most one pair", () => {
    const pool = poolOf([attrs("山"), attrs("水"), attrs("火")]);
    const pairs = findMatchedPairs(pool, ["山", "水", "火"], noConfusability, DEFAULT_MATCH_CRITERIA);
    expect(pairs).toEqual([{ characters: ["山", "水"] }]); // 火 left unpaired (odd count)

    const usedCharacters = pairs.flatMap((p) => p.characters);
    expect(new Set(usedCharacters).size).toBe(usedCharacters.length);
  });

  it("produces no pairs when nothing matches", () => {
    const pool = poolOf([
      attrs("山", { strokeCount: 1 }),
      attrs("水", { strokeCount: 20 }),
    ]);
    const pairs = findMatchedPairs(pool, ["山", "水"], noConfusability, DEFAULT_MATCH_CRITERIA);
    expect(pairs).toEqual([]);
  });

  it("is deterministic — no randomness in pairing itself", () => {
    const pool = poolOf([attrs("山"), attrs("水"), attrs("火"), attrs("好")]);
    const candidates = ["山", "水", "火", "好"];
    const first = findMatchedPairs(pool, candidates, noConfusability, DEFAULT_MATCH_CRITERIA);
    const second = findMatchedPairs(pool, candidates, noConfusability, DEFAULT_MATCH_CRITERIA);
    expect(second).toEqual(first);
  });
});
