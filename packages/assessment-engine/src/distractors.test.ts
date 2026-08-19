import { describe, expect, it } from "vitest";
import type { CandidatePool, CharacterAttributes } from "@shizi/character-data";
import { pickDistractors, shuffled } from "./distractors.js";

function attrs(character: string): CharacterAttributes {
  return {
    character,
    frequencyRank: 1,
    concreteness: "concrete",
    pictographic: false,
    tagSource: "reviewed",
    strokeCount: 1,
    strokeData: null,
    personalRelevance: 0,
  };
}

const POOL: CandidatePool = new Map(
  ["target", "n1", "n2", "x1", "x2", "x3"].map((c) => [c, attrs(c)]),
);

const CONFUSABILITY = new Map([
  ["target", new Set(["n1", "n2"])],
  ["n1", new Set(["target"])],
  ["n2", new Set(["target"])],
]);

// Deterministic fake randomness — no shuffling, for predictable ordering assertions.
const noShuffleRandom = () => 0;

describe("pickDistractors (assessment spec: 'Difficulty calibration (Loop 4)')", () => {
  it("never includes the target itself", () => {
    const picks = pickDistractors("target", POOL, CONFUSABILITY, 0.9, 5, { random: Math.random });
    expect(picks).not.toContain("target");
  });

  it("at a high confusability level, prefers confusable neighbors first", () => {
    const picks = pickDistractors("target", POOL, CONFUSABILITY, 1, 2, { random: noShuffleRandom });
    expect(new Set(picks)).toEqual(new Set(["n1", "n2"]));
  });

  it("at a low confusability level, prefers non-confusable characters first", () => {
    const picks = pickDistractors("target", POOL, CONFUSABILITY, 0, 3, { random: noShuffleRandom });
    expect(picks).toEqual(expect.arrayContaining(["x1", "x2", "x3"]));
    expect(picks).not.toEqual(expect.arrayContaining(["n1"]));
  });

  it("fills the full requested count even if the preferred group runs out", () => {
    const picks = pickDistractors("target", POOL, CONFUSABILITY, 1, 5, { random: noShuffleRandom });
    expect(picks).toHaveLength(5); // only 2 confusable neighbors exist; the rest come from non-confusable
  });

  it("a character with no confusable neighbors still gets a full option set", () => {
    const picks = pickDistractors("x1", POOL, CONFUSABILITY, 1, 3, { random: noShuffleRandom });
    expect(picks).toHaveLength(3);
  });
});

describe("shuffled", () => {
  it("is a permutation — same elements, same length", () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffled(items, Math.random);
    expect(result).toHaveLength(items.length);
    expect(new Set(result)).toEqual(new Set(items));
  });

  it("is deterministic given the same random source", () => {
    let calls = 0;
    const seeded = () => {
      const values = [0.9, 0.1, 0.5, 0.3];
      return values[calls++ % values.length]!;
    };
    const first = shuffled([1, 2, 3, 4, 5], seeded);
    calls = 0;
    const second = shuffled([1, 2, 3, 4, 5], seeded);
    expect(second).toEqual(first);
  });
});
