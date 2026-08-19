import { describe, expect, it } from "vitest";
import { DEFAULT_DILUTION_CONFIG, isInformativeSlot, pickEasyItem } from "./dilution.js";

describe("isInformativeSlot (assessment spec: 'Felt-difficulty dilution')", () => {
  it("scenario: session includes guaranteed-success items at approximately the configured ratio", () => {
    const slots = Array.from({ length: 15 }, (_, i) => isInformativeSlot(i, DEFAULT_DILUTION_CONFIG));
    const informativeCount = slots.filter(Boolean).length;
    const easyCount = slots.length - informativeCount;
    // Default 4:1 — over 15 slots, expect exactly 3 informative, 12 easy.
    expect(informativeCount).toBe(3);
    expect(easyCount).toBe(12);
  });

  it("informative slot is always the last of each block, never the first", () => {
    expect(isInformativeSlot(0, DEFAULT_DILUTION_CONFIG)).toBe(false);
    expect(isInformativeSlot(4, DEFAULT_DILUTION_CONFIG)).toBe(true);
    expect(isInformativeSlot(5, DEFAULT_DILUTION_CONFIG)).toBe(false);
    expect(isInformativeSlot(9, DEFAULT_DILUTION_CONFIG)).toBe(true);
  });

  it("respects a custom ratio", () => {
    const config = { easyPerInformative: 1 }; // 1:1
    expect(isInformativeSlot(0, config)).toBe(false);
    expect(isInformativeSlot(1, config)).toBe(true);
    expect(isInformativeSlot(2, config)).toBe(false);
    expect(isInformativeSlot(3, config)).toBe(true);
  });
});

describe("pickEasyItem", () => {
  it("rotates through the pool rather than repeating one item", () => {
    const pool = ["a", "b", "c"];
    expect(pickEasyItem(pool, 0)).toBe("a");
    expect(pickEasyItem(pool, 1)).toBe("b");
    expect(pickEasyItem(pool, 2)).toBe("c");
    expect(pickEasyItem(pool, 3)).toBe("a"); // wraps
  });

  it("returns null for an empty pool rather than throwing", () => {
    expect(pickEasyItem([], 0)).toBeNull();
  });
});
