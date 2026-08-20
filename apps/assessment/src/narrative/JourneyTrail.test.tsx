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

function fillWidthPercent(container: HTMLElement): number {
  const fill = container.querySelector('[data-testid="journey-trail"] > div') as HTMLDivElement;
  return Number.parseFloat(fill.style.width);
}

describe("JourneyTrail (assessment spec: 'Narrative framing' — elapsed-bout progress cue is non-numeric)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts at 0% width", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming({ elapsedMs: 0 })} beatIndex={0} complete={false} />);
    expect(fillWidthPercent(container)).toBe(0);
  });

  it("advances the fill width as elapsed time increases, on each 1Hz tick", () => {
    let elapsed = 0;
    const timing: SessionTiming = { elapsedSinceStartMs: () => elapsed, maxDurationMs: 90_000, maxItems: 30 };
    const { container } = render(<JourneyTrail timing={timing} beatIndex={0} complete={false} />);
    const before = fillWidthPercent(container);

    elapsed = 45_000;
    vi.advanceTimersByTime(1000);

    expect(fillWidthPercent(container)).toBeGreaterThan(before);
  });

  it("shows 100% width when complete", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming({ elapsedMs: 1000 })} beatIndex={2} complete={true} />);
    expect(fillWidthPercent(container)).toBe(100);
  });

  it("renders no text content at all — the no-digits guarantee asserted at this component's own level", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={5} complete={false} />);
    expect(container.textContent).toBe("");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("the fill uses only the existing --color-accent token, never a new urgency color", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={false} />);
    const fill = container.querySelector('[data-testid="journey-trail"] > div') as HTMLDivElement;
    expect(fill.style.background).toContain("var(--color-accent)");
  });

  it("the track is aria-hidden (decorative)", () => {
    const { container } = render(<JourneyTrail timing={fakeTiming()} beatIndex={0} complete={false} />);
    const track = container.querySelector('[data-testid="journey-trail"]') as HTMLDivElement;
    expect(track.getAttribute("aria-hidden")).toBe("true");
  });

  it("clears the interval on unmount", () => {
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
