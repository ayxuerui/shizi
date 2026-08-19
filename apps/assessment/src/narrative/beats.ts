import { COPY } from "../copy.js";

export interface Beat {
  goal: string;
}

/**
 * Hand-authored journey-ladder script — task 8.8's narrative framing.
 * PLACEHOLDER content, flagged alongside `WukongPlaceholder.tsx` as the
 * thing real story direction replaces; the mechanism (a small, concrete
 * goal per beat, cycling rather than running out) is real.
 *
 * Cycles rather than exhausts: `DEFAULT_ASSESSMENT_SESSION_CONFIG.maxItems`
 * is 30, comfortably more than `COPY.narrative.goals.length` — a fixed,
 * non-cycling script would run out mid-bout.
 */
export function beatForIndex(index: number): Beat {
  const goals = COPY.narrative.goals;
  const goal = goals[index % goals.length]!;
  return { goal: `${COPY.narrative.goalPrefix}${goal}` };
}
