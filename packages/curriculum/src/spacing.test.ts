import { describe, expect, it } from "vitest";
import { filterBySpacing, violatesSpacingConstraint } from "./spacing.js";
import type { CurriculumState } from "./types.js";

const confusabilityIndex = new Map([
  ["日", new Set(["白"])],
  ["白", new Set(["日"])],
]);

describe("violatesSpacingConstraint (curriculum spec: 'Confusability spacing is a hard constraint')", () => {
  it("is true when the candidate is confusable with a recently-introduced character", () => {
    const state: CurriculumState = { knownSet: new Set(), recentlyIntroduced: ["白"] };
    expect(violatesSpacingConstraint("日", state, confusabilityIndex)).toBe(true);
  });

  it("is false when the candidate has no confusable relationship at all", () => {
    const state: CurriculumState = { knownSet: new Set(), recentlyIntroduced: ["白"] };
    expect(violatesSpacingConstraint("山", state, confusabilityIndex)).toBe(false);
  });

  it("is false when the confusable character was NOT recently introduced", () => {
    const state: CurriculumState = { knownSet: new Set(), recentlyIntroduced: ["山"] };
    expect(violatesSpacingConstraint("日", state, confusabilityIndex)).toBe(false);
  });
});

describe("filterBySpacing — scenario: confusable candidate is skipped", () => {
  it("removes candidates confusable with the recent window, keeps the rest", () => {
    const state: CurriculumState = { knownSet: new Set(), recentlyIntroduced: ["白"] };
    const result = filterBySpacing(["日", "山", "水"], state, confusabilityIndex, 5);
    expect(result).toEqual(["山", "水"]);
  });

  it("only protects the configured window size, not the full history", () => {
    const state: CurriculumState = {
      knownSet: new Set(),
      // "白" is 3 characters back — outside a window of 2.
      recentlyIntroduced: ["白", "水", "山"],
    };
    const result = filterBySpacing(["日"], state, confusabilityIndex, 2);
    expect(result).toEqual(["日"]); // not filtered — 白 fell outside the window
  });

  it("scenario: no non-confusable candidate available — returns empty, doesn't throw", () => {
    const state: CurriculumState = { knownSet: new Set(), recentlyIntroduced: ["白"] };
    expect(filterBySpacing(["日"], state, confusabilityIndex, 5)).toEqual([]);
  });
});
