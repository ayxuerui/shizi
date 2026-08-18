import { describe, expect, it } from "vitest";
import { assembleCandidatePool, buildConfusabilityIndex, computeConfusability } from "@shizi/character-data";
import { scoreCandidate } from "./scoring.js";
import { DEFAULT_SCORING_WEIGHTS } from "./types.js";
import type { CurriculumState } from "./types.js";

const pool = assembleCandidatePool();
const confusabilityIndex = buildConfusabilityIndex(computeConfusability(pool));

function state(overrides: Partial<CurriculumState> = {}): CurriculumState {
  return { knownSet: new Set(), recentlyIntroduced: [], ...overrides };
}

describe("scoreCandidate", () => {
  it("throws for a character not in the pool", () => {
    expect(() =>
      scoreCandidate("龘", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex),
    ).toThrow();
  });

  it("word-unlock and story-unlock factors are 0 for every candidate (documented scope gap — no word list or story corpus exists yet)", () => {
    const scored = scoreCandidate("山", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    expect(scored.factors.wordUnlock).toBe(0);
    expect(scored.factors.storyUnlock).toBe(0);
  });

  it("gives personally-relevant characters a nonzero personalRelevance factor", () => {
    const wukong = scoreCandidate("悟", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    const mundane = scoreCandidate("山", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    expect(wukong.factors.personalRelevance).toBeGreaterThan(mundane.factors.personalRelevance);
  });

  it("scores a pictographic, low-stroke character as more learnable than a high-stroke, non-pictographic one", () => {
    // 一 (1 stroke) should score higher on learnability than 谢 (many strokes).
    const simple = scoreCandidate("一", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    const complex = scoreCandidate("谢", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    expect(simple.factors.learnability).toBeGreaterThan(complex.factors.learnability);
  });

  it("penalizes a candidate confusable with characters already in the known set", () => {
    const withoutKnownNeighbor = scoreCandidate(
      "日",
      pool,
      state({ knownSet: new Set() }),
      DEFAULT_SCORING_WEIGHTS,
      confusabilityIndex,
    );
    const withKnownNeighbor = scoreCandidate(
      "日",
      pool,
      state({ knownSet: new Set(["白"]) }), // 日/白 are a curated confusable pair
      DEFAULT_SCORING_WEIGHTS,
      confusabilityIndex,
    );
    expect(withKnownNeighbor.factors.confusabilityPenalty).toBeLessThan(
      withoutKnownNeighbor.factors.confusabilityPenalty,
    );
  });

  it("respects configured weights — zeroing a weight removes that factor's contribution to score", () => {
    const withWeight = scoreCandidate("悟", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    const zeroed = scoreCandidate(
      "悟",
      pool,
      state(),
      { ...DEFAULT_SCORING_WEIGHTS, personalRelevance: 0 },
      confusabilityIndex,
    );
    expect(zeroed.score).toBeLessThan(withWeight.score);
  });

  it("is deterministic — same inputs produce the same score every time (spec: 'Selection is reproducible')", () => {
    const first = scoreCandidate("悟", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    const second = scoreCandidate("悟", pool, state(), DEFAULT_SCORING_WEIGHTS, confusabilityIndex);
    expect(second).toEqual(first);
  });
});
