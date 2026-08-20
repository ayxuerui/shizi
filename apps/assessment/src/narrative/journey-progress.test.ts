import { describe, expect, it } from "vitest";
import { journeyChannels, PRE_CLOSING_CAP } from "./journey-progress.js";

describe("journeyChannels (assessment spec: 'Narrative framing' — elapsed-bout progress cue is non-numeric)", () => {
  it("computes the time channel from elapsed time, independent of item progress", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 45_000,
      maxDurationMs: 90_000,
      beatIndex: 1,
      maxItems: 30,
      complete: false,
    });
    expect(timeFraction).toBeCloseTo(0.5);
    expect(itemFraction).toBeCloseTo(1 / 30);
  });

  it("computes the item channel from beatIndex, independent of elapsed time", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 1_000,
      maxDurationMs: 90_000,
      beatIndex: 15,
      maxItems: 30,
      complete: false,
    });
    expect(itemFraction).toBeCloseTo(0.5);
    expect(timeFraction).toBeCloseTo(1_000 / 90_000);
  });

  it("the two channels can move independently — no blending between them (the anti-saturation case: time ahead of items)", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 60_000,
      maxDurationMs: 90_000,
      beatIndex: 6, // saturated on the old 6-stone display, but only 6/30 items in
      maxItems: 30,
      complete: false,
    });
    expect(timeFraction).toBeCloseTo(60_000 / 90_000);
    expect(itemFraction).toBeCloseTo(6 / 30);
    expect(timeFraction).toBeGreaterThan(itemFraction);
  });

  it("the two channels can move independently — items ahead of time (a short test bout)", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 1_000,
      maxDurationMs: 90_000,
      beatIndex: 1,
      maxItems: 2,
      complete: false,
    });
    expect(itemFraction).toBeCloseTo(0.5);
    expect(timeFraction).toBeCloseTo(1_000 / 90_000);
    expect(itemFraction).toBeGreaterThan(timeFraction);
  });

  it("elapsedSinceStartMs: null makes the time channel 0, not NaN, without affecting the item channel", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: null,
      maxDurationMs: 90_000,
      beatIndex: 3,
      maxItems: 30,
      complete: false,
    });
    expect(timeFraction).toBe(0);
    expect(Number.isNaN(timeFraction)).toBe(false);
    expect(itemFraction).toBeCloseTo(0.1);
  });

  it("maxDurationMs: 0 makes the time channel 0, never Infinity, without affecting the item channel", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 5_000,
      maxDurationMs: 0,
      beatIndex: 3,
      maxItems: 30,
      complete: false,
    });
    expect(Number.isFinite(timeFraction)).toBe(true);
    expect(timeFraction).toBe(0);
    expect(itemFraction).toBeCloseTo(0.1);
  });

  it("maxItems: 0 makes the item channel 0, never Infinity, without affecting the time channel", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 9_000,
      maxDurationMs: 90_000,
      beatIndex: 5,
      maxItems: 0,
      complete: false,
    });
    expect(Number.isFinite(itemFraction)).toBe(true);
    expect(itemFraction).toBe(0);
    expect(timeFraction).toBeCloseTo(0.1);
  });

  it("each channel is capped at PRE_CLOSING_CAP independently, even many multiples past its own bound, while not complete", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 900_000, // 10x the max duration
      maxDurationMs: 90_000,
      beatIndex: 300, // 10x maxItems
      maxItems: 30,
      complete: false,
    });
    expect(timeFraction).toBe(PRE_CLOSING_CAP);
    expect(itemFraction).toBe(PRE_CLOSING_CAP);
  });

  it("both channels are exactly 1 when complete, regardless of which bound the scenario represents (duration-bounded)", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 90_000,
      maxDurationMs: 90_000,
      beatIndex: 5, // item-count nowhere near its bound
      maxItems: 30,
      complete: true,
    });
    expect(timeFraction).toBe(1);
    expect(itemFraction).toBe(1);
  });

  it("both channels are exactly 1 when complete, regardless of which bound the scenario represents (item-bounded) — the 'child never sees which bound fired' guard", () => {
    const { timeFraction, itemFraction } = journeyChannels({
      elapsedSinceStartMs: 5_000, // duration nowhere near its bound
      maxDurationMs: 90_000,
      beatIndex: 30,
      maxItems: 30,
      complete: true,
    });
    expect(timeFraction).toBe(1);
    expect(itemFraction).toBe(1);
  });
});
