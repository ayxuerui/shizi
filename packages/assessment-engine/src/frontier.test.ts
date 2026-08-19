import { describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import {
  buildFrontierCandidates,
  computeFrontierBounds,
  selectNextFrontierProbe,
  type FrontierCandidate,
} from "./frontier.js";

const CANDIDATES: readonly FrontierCandidate[] = [
  { character: "a", difficulty: 0.1 },
  { character: "b", difficulty: 0.3 },
  { character: "c", difficulty: 0.5 },
  { character: "d", difficulty: 0.7 },
  { character: "e", difficulty: 0.9 },
];

function event(overrides: Partial<LearnerEvent>): LearnerEvent {
  return {
    id: "evt",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "s1",
    character: "x",
    modality: "hear-tap",
    outcome: "correct",
    latencyMs: 500,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

describe("computeFrontierBounds (assessment spec: 'Coarse probing before narrowing', 'Narrowing around the discovered frontier')", () => {
  const difficultyIndex = new Map(CANDIDATES.map((c) => [c.character, c.difficulty]));

  it("returns both bounds null with no history — scenario: no prior knowledge of the frontier", () => {
    expect(computeFrontierBounds([], new Set(), difficultyIndex)).toEqual({
      knownFloor: null,
      unknownCeiling: null,
    });
  });

  it("sets knownFloor to the hardest known character's difficulty", () => {
    const bounds = computeFrontierBounds([], new Set(["a", "c"]), difficultyIndex);
    expect(bounds.knownFloor).toBe(0.5);
    expect(bounds.unknownCeiling).toBeNull();
  });

  it("sets unknownCeiling to the easiest not-yet-known character with a miss", () => {
    const events = [event({ character: "d", outcome: "incorrect" }), event({ character: "e", outcome: "incorrect" })];
    const bounds = computeFrontierBounds(events, new Set(), difficultyIndex);
    expect(bounds.unknownCeiling).toBe(0.7);
    expect(bounds.knownFloor).toBeNull();
  });

  it("ignores a miss on an already-known character when computing unknownCeiling", () => {
    const events = [event({ character: "a", outcome: "incorrect" })];
    const bounds = computeFrontierBounds(events, new Set(["a"]), difficultyIndex);
    expect(bounds.unknownCeiling).toBeNull();
  });

  it("both bounds set once a returning learner's history has known and missed characters — narrows immediately, not coarse again", () => {
    const events = [event({ character: "d", outcome: "incorrect" })];
    const bounds = computeFrontierBounds(events, new Set(["b"]), difficultyIndex);
    expect(bounds).toEqual({ knownFloor: 0.3, unknownCeiling: 0.7 });
  });
});

describe("buildFrontierCandidates", () => {
  it("excludes known characters and preserves difficulty ascending order", () => {
    const difficultyIndex = new Map(CANDIDATES.map((c) => [c.character, c.difficulty]));
    // Use a fake pool shape sufficient for isUsable — reuse real character-data pool instead for a realistic check elsewhere; here we exercise sort/exclude only via a stub CandidatePool-shaped map.
    const pool = new Map(
      CANDIDATES.map((c) => [
        c.character,
        {
          character: c.character,
          frequencyRank: 1,
          concreteness: "concrete" as const,
          pictographic: false,
          tagSource: "reviewed" as const,
          strokeCount: 1,
          strokeData: { strokes: ["M0 0"], medians: [[[0, 0] as [number, number]]] },
          personalRelevance: 0,
        },
      ]),
    );
    const result = buildFrontierCandidates(pool, new Set(["c"]), difficultyIndex);
    expect(result.map((r) => r.character)).toEqual(["a", "b", "d", "e"]);
  });
});

describe("selectNextFrontierProbe", () => {
  it("returns null for an empty candidate list", () => {
    expect(selectNextFrontierProbe([], { knownFloor: null, unknownCeiling: null }, 0)).toBeNull();
  });

  it("scenario: coarse probing spans a wide difficulty range before narrowing", () => {
    const bounds = { knownFloor: null, unknownCeiling: null };
    const picks = [0, 1, 2, 3].map((round) => selectNextFrontierProbe(CANDIDATES, bounds, round)!.difficulty);
    const spread = Math.max(...picks) - Math.min(...picks);
    expect(spread).toBeGreaterThan(0.5); // touches both easy and hard ends, not one narrow band
  });

  it("scenario: narrowing concentrates probes near the discovered frontier", () => {
    const bounds = { knownFloor: 0.3, unknownCeiling: 0.7 };
    const picked = selectNextFrontierProbe(CANDIDATES, bounds, 0);
    // Midpoint is 0.5 — "c" (0.5) is the closest candidate.
    expect(picked!.character).toBe("c");
  });

  it("falls back to the full candidate set when nothing falls within a degenerate (crossed) band", () => {
    const bounds = { knownFloor: 0.9, unknownCeiling: 0.1 }; // no candidate satisfies difficulty in [0.9, 0.1]
    const picked = selectNextFrontierProbe(CANDIDATES, bounds, 0);
    expect(picked).not.toBeNull();
  });

  it("is deterministic — same candidates/bounds/roundIndex always pick the same candidate", () => {
    const bounds = { knownFloor: 0.3, unknownCeiling: 0.7 };
    expect(selectNextFrontierProbe(CANDIDATES, bounds, 2)).toEqual(selectNextFrontierProbe(CANDIDATES, bounds, 2));
  });
});
