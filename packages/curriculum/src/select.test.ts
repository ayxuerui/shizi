import { describe, expect, it } from "vitest";
import {
  assembleCandidatePool,
  buildConfusabilityIndex,
  computeConfusability,
  PHASE_A_SEQUENCE,
} from "@shizi/character-data";
import { selectNextCharacter } from "./select.js";
import { DEFAULT_CURRICULUM_CONFIG } from "./types.js";
import type { CurriculumState } from "./types.js";

const pool = assembleCandidatePool();
const confusabilityIndex = buildConfusabilityIndex(computeConfusability(pool));

function state(overrides: Partial<CurriculumState> = {}): CurriculumState {
  return { knownSet: new Set(), recentlyIntroduced: [], ...overrides };
}

describe("selectNextCharacter", () => {
  it("draws from Phase A while it isn't exhausted", () => {
    const result = selectNextCharacter(pool, state(), confusabilityIndex);
    expect(result).toEqual({ status: "phase-a", character: PHASE_A_SEQUENCE[0] });
  });

  // The real pool now carries draft concreteness/pictographic tags
  // (task 3.3's draft pass) for nearly every character, which would make
  // phase-b test setup nondeterministic and hard to control — many
  // candidates would compete for top score. These tests need exactly one
  // controlled, usable, non-Phase-A, non-identity candidate, so this
  // helper masks every other character back to "untagged" (the
  // pre-review state exclusion.ts still describes) and guarantees the
  // target is usable. "谢" is confirmed not in Phase A or the identity
  // set, so it's safe to use as that stand-in.
  function withOneUsableCandidate(character: string): typeof pool {
    const modified = new Map(pool);
    for (const [key, entry] of modified) {
      modified.set(
        key,
        key === character
          ? { ...entry, concreteness: "concrete", pictographic: false, tagSource: "reviewed" }
          : { ...entry, concreteness: null, pictographic: null, tagSource: null },
      );
    }
    return modified;
  }

  it("falls through to phase-b once Phase A is exhausted", () => {
    const result = selectNextCharacter(
      withOneUsableCandidate("谢"),
      state({ knownSet: new Set(PHASE_A_SEQUENCE) }),
      confusabilityIndex,
    );
    expect(result).toEqual({ status: "phase-b", character: "谢", scored: expect.anything() });
  });

  it("phase-b never selects an already-known character", () => {
    const knownSet = new Set([...PHASE_A_SEQUENCE, "谢"]);
    const result = selectNextCharacter(withOneUsableCandidate("谢"), state({ knownSet }), confusabilityIndex);
    if (result.status === "phase-b") {
      expect(knownSet.has(result.character)).toBe(false);
    } else {
      expect(result.status).toBe("none-eligible"); // 谢 was the only usable one, and it's now known
    }
  });

  it("phase-b never selects an identity-set character as a new target (character-data spec: identity characters aren't proposed as new targets)", () => {
    const knownSet = new Set(PHASE_A_SEQUENCE);
    const result = selectNextCharacter(withOneUsableCandidate("谢"), state({ knownSet }), confusabilityIndex);
    if (result.status === "phase-b") {
      // Identity characters are excluded from the pool's productive
      // membership list entirely (see pool-membership.ts), so they can
      // never surface here regardless of usability.
      expect(["薛", "亦", "霖", "小", "蓝", "莓"]).not.toContain(result.character);
    }
  });

  it("is deterministic — same state + config always ranks the same way (spec: 'Selection is reproducible')", () => {
    const knownSet = new Set(PHASE_A_SEQUENCE);
    const testPool = withOneUsableCandidate("谢");
    const first = selectNextCharacter(testPool, state({ knownSet }), confusabilityIndex);
    const second = selectNextCharacter(testPool, state({ knownSet }), confusabilityIndex);
    expect(second).toEqual(first);
  });

  // A custom confusability fixture, independent of the real computed
  // one, so these two tests have full control and aren't affected by
  // 谢's real (if any) confusable neighbors in the actual data.
  const fakeConfusabilityIndex = new Map([
    ["谢", new Set(["写"])],
    ["写", new Set(["谢"])],
  ]);

  it("scenario: no non-confusable candidate available — declines to select rather than violate spacing", () => {
    const result = selectNextCharacter(
      withOneUsableCandidate("谢"),
      state({ knownSet: new Set(PHASE_A_SEQUENCE), recentlyIntroduced: ["写"] }),
      fakeConfusabilityIndex,
    );
    expect(result).toEqual({
      status: "none-eligible",
      reason: "every not-yet-known, usable candidate is confusable with a recently-introduced character",
    });
  });

  it("respects a custom recentWindowSize via config — a narrower window lets an older confusable pair back in", () => {
    const knownSet = new Set(PHASE_A_SEQUENCE);
    const testPool = withOneUsableCandidate("谢");

    // "写" (confusable with 谢) was introduced 3 characters ago.
    const stateWithHistory = state({ knownSet, recentlyIntroduced: ["写", "水", "山"] });

    const narrowWindow = selectNextCharacter(testPool, stateWithHistory, fakeConfusabilityIndex, {
      ...DEFAULT_CURRICULUM_CONFIG,
      recentWindowSize: 2, // 写 is 3-back, outside this window
    });
    const wideWindow = selectNextCharacter(testPool, stateWithHistory, fakeConfusabilityIndex, {
      ...DEFAULT_CURRICULUM_CONFIG,
      recentWindowSize: 5, // 写 is within this window
    });

    expect(narrowWindow).toEqual({
      status: "phase-b",
      character: "谢",
      scored: expect.objectContaining({ character: "谢" }),
    });
    expect(wideWindow.status).toBe("none-eligible");
  });
});
