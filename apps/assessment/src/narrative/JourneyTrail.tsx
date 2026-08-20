import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { SessionTiming } from "../session/use-assessment-session.js";
import { journeyChannels } from "./journey-progress.js";

export interface JourneyTrailProps {
  timing: SessionTiming;
  beatIndex: number;
  complete: boolean;
}

const TICK_MS = 1000;
const TRACK_HEIGHT_PX = 3;
const TRACK_GAP_PX = 3;

interface TrackProps {
  testId: string;
  fillRef: RefObject<HTMLDivElement>;
  transition: string;
}

function Track({ testId, fillRef, transition }: TrackProps) {
  return (
    <div
      data-testid={testId}
      style={{
        height: `${TRACK_HEIGHT_PX}px`,
        borderRadius: `${TRACK_HEIGHT_PX / 2}px`,
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
          transition,
        }}
      />
    </div>
  );
}

/**
 * TWO independently-honest trails behind `NarrativeStage`'s stone path —
 * one for elapsed time, one for items answered — see `journey-progress.ts`
 * for why these are shown separately rather than blended into one number.
 * Both fill, never drain; `--color-accent` only, at low opacity, so the
 * stones (rendered above this, solid) stay visually dominant.
 * `aria-hidden`: decorative, and announcing a fraction to a screen reader
 * would be exactly the numeric statement this cue is designed to avoid.
 *
 * Writes both fills' `style.width` directly to refs on a SHARED 1Hz
 * interval rather than `useState`, deliberately: a per-second `setState`
 * anywhere in the `BoutScreen` subtree would re-render `ProbePanel` every
 * second during probing and produce `act()` warning noise in tests that
 * already run real timers for several seconds. A width is animation
 * output, not state anything else derives from. One interval drives both
 * fills — no reason to run two independent timers for the same tick.
 */
export function JourneyTrail({ timing, beatIndex, complete }: JourneyTrailProps) {
  const timeFillRef = useRef<HTMLDivElement>(null);
  const itemFillRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const transition = prefersReducedMotion ? "none" : "width 1000ms linear";

  useEffect(() => {
    function tick(): void {
      const { timeFraction, itemFraction } = journeyChannels({
        elapsedSinceStartMs: timing.elapsedSinceStartMs(),
        maxDurationMs: timing.maxDurationMs,
        beatIndex,
        maxItems: timing.maxItems,
        complete,
      });
      if (timeFillRef.current) timeFillRef.current.style.width = `${timeFraction * 100}%`;
      if (itemFillRef.current) itemFillRef.current.style.width = `${itemFraction * 100}%`;
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
        display: "flex",
        flexDirection: "column",
        gap: `${TRACK_GAP_PX}px`,
      }}
    >
      <Track testId="journey-trail-time" fillRef={timeFillRef} transition={transition} />
      <Track testId="journey-trail-item" fillRef={itemFillRef} transition={transition} />
    </div>
  );
}
