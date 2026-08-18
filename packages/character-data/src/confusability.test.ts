import { describe, expect, it } from "vitest";
import { assembleCandidatePool } from "./pool.js";
import { buildConfusabilityIndex, computeConfusability } from "./confusability.js";

describe("computeConfusability", () => {
  const pool = assembleCandidatePool();
  const pairs = computeConfusability(pool);

  it("includes curated pairs when both members are in the pool", () => {
    const hasPair = pairs.some(
      (p) =>
        (p.a === "日" && p.b === "白") || (p.a === "白" && p.b === "日"),
    );
    expect(hasPair).toBe(true);
  });

  it("does not pair a character with itself", () => {
    expect(pairs.some((p) => p.a === p.b)).toBe(false);
  });

  it("does not record the same pair twice", () => {
    const keys = pairs.map((p) => (p.a < p.b ? `${p.a}-${p.b}` : `${p.b}-${p.a}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic across runs against the same pool", () => {
    const again = computeConfusability(pool);
    expect(again).toEqual(pairs);
  });
});

describe("buildConfusabilityIndex", () => {
  it("is queryable from either character in a pair", () => {
    const index = buildConfusabilityIndex([{ a: "日", b: "白", reason: "curated" }]);
    expect(index.get("日")?.has("白")).toBe(true);
    expect(index.get("白")?.has("日")).toBe(true);
  });
});
