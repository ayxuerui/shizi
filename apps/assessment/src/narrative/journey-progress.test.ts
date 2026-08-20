import { describe, expect, it } from "vitest";
import { journeyFraction, PRE_CLOSING_CAP } from "./journey-progress.js";

describe("journeyFraction (assessment spec: 'Narrative framing' — elapsed-bout progress cue is non-numeric)", () => {
  it("computes the time channel alone when items are behind", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 45_000,
      maxDurationMs: 90_000,
      beatIndex: 1,
      maxItems: 30,
      complete: false,
    });
    expect(fraction).toBeCloseTo(0.5);
  });

  it("computes the item channel alone when time is behind", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 1_000,
      maxDurationMs: 90_000,
      beatIndex: 15,
      maxItems: 30,
      complete: false,
    });
    expect(fraction).toBeCloseTo(0.5);
  });

  it("max() picks the larger channel — time ahead of items (the anti-saturation case)", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 60_000,
      maxDurationMs: 90_000,
      beatIndex: 6, // saturated on the old 6-stone display, but only 6/30 items in
      maxItems: 30,
      complete: false,
    });
    expect(fraction).toBeCloseTo(60_000 / 90_000);
  });

  it("max() picks the larger channel — items ahead of time (a short test bout)", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 1_000,
      maxDurationMs: 90_000,
      beatIndex: 1,
      maxItems: 2,
      complete: false,
    });
    expect(fraction).toBeCloseTo(0.5);
  });

  it("elapsedSinceStartMs: null contributes 0 to the time channel, not NaN", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: null,
      maxDurationMs: 90_000,
      beatIndex: 3,
      maxItems: 30,
      complete: false,
    });
    expect(fraction).toBeCloseTo(0.1);
    expect(Number.isNaN(fraction)).toBe(false);
  });

  it("maxDurationMs: 0 contributes 0 to the time channel, never Infinity", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 5_000,
      maxDurationMs: 0,
      beatIndex: 3,
      maxItems: 30,
      complete: false,
    });
    expect(Number.isFinite(fraction)).toBe(true);
    expect(fraction).toBeCloseTo(0.1);
  });

  it("maxItems: 0 contributes 0 to the item channel, never Infinity", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 9_000,
      maxDurationMs: 90_000,
      beatIndex: 5,
      maxItems: 0,
      complete: false,
    });
    expect(Number.isFinite(fraction)).toBe(true);
    expect(fraction).toBeCloseTo(0.1);
  });

  it("is capped at PRE_CLOSING_CAP even when elapsed time is many multiples of maxDurationMs, while not complete", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 900_000, // 10x the max duration
      maxDurationMs: 90_000,
      beatIndex: 30,
      maxItems: 30,
      complete: false,
    });
    expect(fraction).toBe(PRE_CLOSING_CAP);
  });

  it("is exactly 1 when complete, regardless of which bound the scenario represents (duration-bounded)", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 90_000,
      maxDurationMs: 90_000,
      beatIndex: 5, // item-count nowhere near its bound
      maxItems: 30,
      complete: true,
    });
    expect(fraction).toBe(1);
  });

  it("is exactly 1 when complete, regardless of which bound the scenario represents (item-bounded) — the 'child never sees which bound fired' guard", () => {
    const fraction = journeyFraction({
      elapsedSinceStartMs: 5_000, // duration nowhere near its bound
      maxDurationMs: 90_000,
      beatIndex: 30,
      maxItems: 30,
      complete: true,
    });
    expect(fraction).toBe(1);
  });
});
