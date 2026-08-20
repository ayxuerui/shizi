/**
 * How close the current bout is to ending, as a plain fraction in
 * [0, 1] — never rendered as a number itself (see `JourneyTrail.tsx`,
 * which turns this into a CSS width, nothing else). `max()` of two
 * channels, not elapsed time alone: the bout ends on WHICHEVER bound
 * fires first (`packages/assessment-engine`'s `nextProbe()`), so "how
 * close to ending" is genuinely the larger of the two. This is also the
 * fix for a real gap in the existing beat display: the 6-stone path
 * saturates at item 6 of a possible `maxItems` (default 30), so a
 * duration-bounded bout looked "stuck" long before it was actually
 * close to done.
 *
 * `completionReason` ("duration" | "item-count") is deliberately NOT an
 * input here — that's what makes "the child never sees which bound
 * fired" (`ClosingBeat.tsx`'s existing principle) structurally true for
 * this cue too, not just true by convention: `complete` alone forces
 * exactly 1, regardless of which channel would have gotten there first.
 */
export const PRE_CLOSING_CAP = 0.97;

export interface JourneyFractionInput {
  /** `null` before the engine exists yet (still awaiting `loadPriorEvents`). */
  elapsedSinceStartMs: number | null;
  maxDurationMs: number;
  beatIndex: number;
  maxItems: number;
  complete: boolean;
}

export function journeyFraction(input: JourneyFractionInput): number {
  if (input.complete) return 1;

  const timeChannel =
    input.maxDurationMs > 0 && input.elapsedSinceStartMs !== null
      ? input.elapsedSinceStartMs / input.maxDurationMs
      : 0;
  const itemChannel = input.maxItems > 0 ? input.beatIndex / input.maxItems : 0;

  const fraction = Math.max(timeChannel, itemChannel);
  return Math.min(Math.max(fraction, 0), PRE_CLOSING_CAP);
}
