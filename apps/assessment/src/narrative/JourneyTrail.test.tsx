import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { SessionTiming } from "../session/use-assessment-session.js";
import { JourneyTrail } from "./JourneyTrail.js";

function fakeTiming(overrides: Partial<{ elapsedMs: number | null; maxDurationMs: number; maxItems: number }> = {}): SessionTiming {
  const elapsedMs = overrides.elapsedMs ?? 0;
  return {
    elapsedSinceStartMs: () => elapsedMs,
    maxDurationMs: overrides.maxDurationMs ?? 90_000,
    maxItems: overrides.maxItems ?? 30,
  };
}

function fillWidthPercent(container: HTMLElement, testId: string): number {
  const fill = container.querySelector(`[data-testid="${testId}"] > div`) as HTMLDivElement;
  return Number.parseFloat(fill.style.width);
}

describe("JourneyTrail (assessment spec: 'Narrative framing' — elapsed-bout progress cue is non-numeric, two independent channels)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("both fills start at 0% width", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming({ elapsedMs: 0 })} beatIndex={0} complete={false} />);
    expect(fillWidthPercent(container, "journey-trail-time")).toBe(0);
    expect(fillWidthPercent(container, "journey-trail-item")).toBe(0);
  });

  it("the time fill advances as elapsed time increases, independent of item progress", () => {
    let elapsed = 0;
    const timing: SessionTiming = { elapsedSinceStartMs: () => elapsed, maxDurationMs: 90_000, maxItems: 30 };
    const { container, rerender } = render(<JourneyTrail timing={timing} beatIndex={0} complete={false} />);
    const itemBefore = fillWidthPercent(container, "journey-trail-item");

    elapsed = 45_000;
    vi.advanceTimersByTime(1000);
    rerender(<JourneyTrail timing={timing} beatIndex={0} complete={false} />);

    expect(fillWidthPercent(container, "journey-trail-time")).toBeGreaterThan(0);
    expect(fillWidthPercent(container, "journey-trail-item")).toBe(itemBefore); // unchanged: beatIndex didn't move
  });

  it("the item fill advances as beatIndex increases, independent of elapsed time (proves there's no hidden blending)", () => {
    const timing: SessionTiming = { elapsedSinceStartMs: () => 0, maxDurationMs: 90_000, maxItems: 30 };
    const { container, rerender } = render(<JourneyTrail timing={timing} beatIndex={0} complete={false} />);

    rerender(<JourneyTrail timing={timing} beatIndex={15} complete={false} />);

    expect(fillWidthPercent(container, "journey-trail-item")).toBeCloseTo(50);
    expect(fillWidthPercent(container, "journey-trail-time")).toBe(0); // unchanged: elapsed time didn't move
  });

  it("both fills show 100% width when complete", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming({ elapsedMs: 1000 })} beatIndex={2} complete={true} />);
    expect(fillWidthPercent(container, "journey-trail-time")).toBe(100);
    expect(fillWidthPercent(container, "journey-trail-item")).toBe(100);
  });

  it("renders no text content at all — the no-digits guarantee asserted at this component's own level", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={5} complete={false} />);
    expect(container.textContent).toBe("");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("both fills use only the existing --color-accent token, never a new urgency color", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={false} />);
    const timeFill = container.querySelector('[data-testid="journey-trail-time"] > div') as HTMLDivElement;
    const itemFill = container.querySelector('[data-testid="journey-trail-item"] > div') as HTMLDivElement;
    expect(timeFill.style.background).toContain("var(--color-accent)");
    expect(itemFill.style.background).toContain("var(--color-accent)");
  });

  it("the outer trail container is aria-hidden (decorative)", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={false} />);
    const trail = container.querySelector('[data-testid="journey-trail"]') as HTMLDivElement;
    expect(trail.getAttribute("aria-hidden")).toBe("true");
  });

  it("clears the shared interval on unmount", () => {
    const { unmount } = render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={false} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not keep an interval running once complete", () => {
    render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={true} />);
    expect(vi.getTimerCount()).toBe(0);
  });
});
