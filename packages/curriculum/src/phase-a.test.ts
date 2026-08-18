import { describe, expect, it } from "vitest";
import { PHASE_A_SEQUENCE } from "@shizi/character-data";
import { isPhaseAExhausted, selectFromPhaseA } from "./phase-a.js";
import type { CurriculumState } from "./types.js";

function state(knownSet: Iterable<string> = []): CurriculumState {
  return { knownSet: new Set(knownSet), recentlyIntroduced: [] };
}

describe("selectFromPhaseA (curriculum spec: 'Fixed Phase A sequence precedes scoring')", () => {
  it("returns the first character when nothing is known yet — scenario: early sequencing uses the fixed list", () => {
    expect(selectFromPhaseA(state())).toBe(PHASE_A_SEQUENCE[0]);
  });

  it("skips already-known Phase A characters — scenario: Phase A already known via assessment", () => {
    const known = PHASE_A_SEQUENCE.slice(0, 3);
    expect(selectFromPhaseA(state(known))).toBe(PHASE_A_SEQUENCE[3]);
  });

  it("skips known characters out of order, not just a prefix", () => {
    // Learner happens to already know the 5th Phase A character (e.g.
    // from 悟空识字) despite not knowing the first four.
    const known = [PHASE_A_SEQUENCE[4]!];
    expect(selectFromPhaseA(state(known))).toBe(PHASE_A_SEQUENCE[0]);
  });

  it("returns null once every Phase A character is known", () => {
    expect(selectFromPhaseA(state(PHASE_A_SEQUENCE))).toBeNull();
  });
});

describe("isPhaseAExhausted", () => {
  it("is false while any Phase A character remains unknown", () => {
    expect(isPhaseAExhausted(state())).toBe(false);
  });

  it("is true once all 25 are known", () => {
    expect(isPhaseAExhausted(state(PHASE_A_SEQUENCE))).toBe(true);
  });
});
