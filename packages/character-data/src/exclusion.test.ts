import { describe, expect, it } from "vitest";
import { assembleCandidatePool } from "./pool.js";
import { isUsable, missingAttributes, partitionByUsability } from "./exclusion.js";

describe("exclusion (character-data spec: 'Missing attribute blocks use')", () => {
  const pool = assembleCandidatePool();

  it("excludes exactly the 10 characters missing frequencyRank, now that draft concreteness/pictographic tags (task 3.3) are in place", () => {
    // 悟/空/姥/木 aren't in the HSK 3.0 Level 1 source list, and the 6
    // identity-set characters (薛亦霖/小蓝莓) were never given a
    // frequencyRank either — both for the same underlying reason (see
    // pool-membership.ts's frequencyRank map). This count is a guard: a
    // real parent review of tagging-review.csv doesn't change it (that
    // only flips tagSource from "draft" to "reviewed"), but a future
    // frequency-rank judgment call for 悟/空/姥/木 (asked for in
    // data/TAGGING-REVIEW.md) should visibly move it from 10 toward 6.
    const { usable, excluded } = partitionByUsability(pool);
    expect(usable.length).toBe(pool.size - 10);
    expect(excluded.length).toBe(10);
    const excludedCharacters = new Set(excluded.map(({ entry }) => entry.character));
    expect(excludedCharacters).toEqual(
      new Set(["悟", "空", "姥", "木", "薛", "亦", "霖", "小", "蓝", "莓"]),
    );
    for (const { missing } of excluded) {
      expect(missing).toEqual(["frequencyRank"]);
    }
  });

  it("populates a usable character's concreteness/pictographic from the draft tag set, flagged as unreviewed", () => {
    const entry = pool.get("山")!;
    expect(isUsable(entry)).toBe(true);
    expect(missingAttributes(entry)).toEqual([]);
    expect(entry.concreteness).toBe("concrete");
    expect(entry.pictographic).toBe(true);
    // Draft, not authoritative — see character-data spec's "Human-
    // supplied concreteness tag" scenario and scripts/build-tags.mjs.
    expect(entry.tagSource).toBe("draft");
  });

  it("reports missing frequencyRank (and only that) for a character outside the HSK1 source", () => {
    const entry = pool.get("悟")!;
    expect(missingAttributes(entry)).toEqual(["frequencyRank"]);
    // Still has a draft concreteness/pictographic tag — that pass ran
    // over all 209 characters, frequency data is the separate gap.
    expect(entry.concreteness).not.toBeNull();
    expect(entry.pictographic).not.toBeNull();
  });

  it("would mark a character usable once every required field is supplied", () => {
    const entry = pool.get("悟")!;
    const completed = { ...entry, frequencyRank: 999 };
    expect(isUsable(completed)).toBe(true);
  });
});
