import { describe, expect, it } from "vitest";
import { createSessionClock } from "./session-clock.js";

function scriptedClock(values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

describe("createSessionClock", () => {
  it("elapsedSinceStartMs() is null before the first elapsedMs() call", () => {
    const clock = createSessionClock({ elapsedMs: scriptedClock([100]) });
    expect(clock.elapsedSinceStartMs()).toBeNull();
  });

  it("the first elapsedMs() call latches the origin", () => {
    const clock = createSessionClock({ elapsedMs: scriptedClock([100, 150]) });
    clock.elapsedMs(); // latches at 100
    expect(clock.elapsedSinceStartMs()).toBe(50); // reads 150 - 100
  });

  it("calling elapsedSinceStartMs() first does NOT latch (regression guard)", () => {
    const clock = createSessionClock({ elapsedMs: scriptedClock([100, 150, 200]) });
    expect(clock.elapsedSinceStartMs()).toBeNull(); // reads 100, does not latch
    clock.elapsedMs(); // latches at 150
    expect(clock.elapsedSinceStartMs()).toBe(50); // reads 200 - 150
  });

  it("elapsedMs() and elapsedSinceStartMs() agree exactly under a scripted clock (the 'same reading by construction' property)", () => {
    const clock = createSessionClock({ elapsedMs: scriptedClock([1000, 1000, 4000]) });
    clock.elapsedMs(); // simulates the engine's constructor latch, at origin=1000
    expect(clock.elapsedSinceStartMs()).toBe(0); // reads 1000 again: 1000 - 1000
    expect(clock.elapsedSinceStartMs()).toBe(3000); // reads 4000: 4000 - 1000
  });

  it("clamps to >= 0 if the injected clock goes backwards", () => {
    const clock = createSessionClock({ elapsedMs: scriptedClock([1000, 500]) });
    clock.elapsedMs(); // latches at 1000
    expect(clock.elapsedSinceStartMs()).toBe(0); // 500 - 1000 would be negative
  });

  it("defaults to a real clock (performance.now) when no override is given", () => {
    const clock = createSessionClock();
    const a = clock.elapsedMs();
    const b = clock.elapsedMs();
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
