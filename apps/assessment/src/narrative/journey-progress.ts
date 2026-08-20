/**
 * How close the current bout is to ending, as two independent, plain
 * fractions in [0, 1] — never rendered as a number itself (see
 * `JourneyTrail.tsx`, which turns each into a CSS width, nothing else).
 * Two SEPARATE channels, not one `max()`-blended value: an earlier
 * version of this collapsed both into a single number specifically to
 * avoid two indicators "visibly disagreeing," but that traded real
 * information for a false sense of tidiness — a parent (not the child;
 * nothing here is numeric or read as a score) benefits from seeing which
 * bound is actually closer to firing, not having that hidden behind a
 * blended figure. The item channel is also the fix for a real gap in the
 * existing beat display: the 6-stone path saturates at item 6 of a
 * possible `maxItems` (default 30), so a duration-bounded bout looked
 * "stuck" long before it was actually close to done.
 *
 * `completionReason` ("duration" | "item-count") is deliberately NOT an
 * input here — that's what makes "the child never sees which bound
 * fired" (`ClosingBeat.tsx`'s existing principle) structurally true for
 * both channels: `complete` alone forces both to exactly 1, regardless
 * of which channel would have gotten there first on its own.
 */
export const PRE_CLOSING_CAP = 0.97;

export interface JourneyChannelsInput {
  /** `null` before the engine exists yet (still awaiting `loadPriorEvents`). */
  elapsedSinceStartMs: number | null;
  maxDurationMs: number;
  beatIndex: number;
  maxItems: number;
  complete: boolean;
}

export interface JourneyChannels {
  timeFraction: number;
  itemFraction: number;
}

export function journeyChannels(input: JourneyChannelsInput): JourneyChannels {
  if (input.complete) return { timeFraction: 1, itemFraction: 1 };

  const timeFraction =
    input.maxDurationMs > 0 && input.elapsedSinceStartMs !== null
      ? clamp(input.elapsedSinceStartMs / input.maxDurationMs)
      : 0;
  const itemFraction = input.maxItems > 0 ? clamp(input.beatIndex / input.maxItems) : 0;

  return { timeFraction, itemFraction };
}

function clamp(fraction: number): number {
  return Math.min(Math.max(fraction, 0), PRE_CLOSING_CAP);
}
