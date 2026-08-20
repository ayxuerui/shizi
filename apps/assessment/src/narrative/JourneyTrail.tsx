import { useEffect, useMemo, useRef } from "react";
import type { SessionTiming } from "../session/use-assessment-session.js";
import { journeyFraction } from "./journey-progress.js";

export interface JourneyTrailProps {
  timing: SessionTiming;
  beatIndex: number;
  complete: boolean;
}

const TICK_MS = 1000;
const TRAIL_HEIGHT_PX = 4;

/**
 * The continuously-filling trail behind `NarrativeStage`'s stone path —
 * see `journey-progress.ts` for what the fraction means and why. Fills,
 * never drains; `--color-accent` only, at low opacity, so the stones
 * (rendered above this, solid) stay visually dominant. `aria-hidden`:
 * decorative, and announcing a fraction to a screen reader would be
 * exactly the numeric statement this cue is designed to avoid.
 *
 * Writes `style.width` directly to a ref on a 1Hz interval rather than
 * `useState`, deliberately: a per-second `setState` anywhere in the
 * `BoutScreen` subtree would re-render `ProbePanel` every second during
 * probing and produce `act()` warning noise in tests that already run
 * real timers for several seconds. A width is animation output, not
 * state anything else derives from.
 */
export function JourneyTrail({ timing, beatIndex, complete }: JourneyTrailProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    function tick(): void {
      const fraction = journeyFraction({
        elapsedSinceStartMs: timing.elapsedSinceStartMs(),
        maxDurationMs: timing.maxDurationMs,
        beatIndex,
        maxItems: timing.maxItems,
        complete,
      });
      if (fillRef.current) fillRef.current.style.width = `${fraction * 100}%`;
    }

    tick(); // compute immediately on mount and on every prop change, not just on the next tick

    if (complete) return undefined; // no need to keep ticking once the bout has ended

    const intervalId = setInterval(tick, TICK_MS);
    return () => clearInterval(intervalId);
  }, [timing, beatIndex, complete]);

  return (
    <div
      data-testid="journey-trail"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "50%",
        transform: "translateY(-50%)",
        height: `${TRAIL_HEIGHT_PX}px`,
        borderRadius: `${TRAIL_HEIGHT_PX / 2}px`,
        background: "var(--color-surface)",
        overflow: "hidden",
      }}
    >
      <div
        ref={fillRef}
        style={{
          height: "100%",
          width: "0%",
          background: "var(--color-accent)",
          opacity: 0.3,
          transition: prefersReducedMotion ? "none" : "width 1000ms linear",
        }}
      />
    </div>
  );
}
