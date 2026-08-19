import type { ProbeItem } from "@shizi/assessment-engine";
import { cueForOutcome } from "../feedback/cues.js";
import type { CueKind } from "../feedback/cues.js";

export type BoutPhase = "intro" | "probing" | "resolving" | "closing" | "done";

/** Feedback cue for the just-answered probe — see feedback/cues.ts's doc
 * comment on why there is deliberately no "wrong"/"error" member here. */
export type ResponseCue = Extract<CueKind, "acknowledge" | "redirect">;

export interface BoutState {
  phase: BoutPhase;
  /** Per `assessment` spec's "Progress advances regardless of accuracy"
   * scenario: increments on every response, correct or not. There is NO
   * score/accuracy field anywhere in this type — a score is
   * unrepresentable here, not just unused. */
  beatIndex: number;
  probe: ProbeItem | null;
  selected: string | null;
  cue: ResponseCue | null;
  completionReason: "duration" | "item-count" | null;
  ratingPhase: "asking" | "settled";
}

export const INITIAL_BOUT_STATE: BoutState = {
  phase: "intro",
  beatIndex: 0,
  probe: null,
  selected: null,
  cue: null,
  completionReason: null,
  ratingPhase: "asking",
};

export type BoutAction =
  | { type: "PROBE_READY"; probe: ProbeItem }
  | { type: "SESSION_COMPLETE"; reason: "duration" | "item-count" }
  | { type: "RESPONDED"; selected: string; correct: boolean }
  | { type: "RATED" }
  | { type: "RATING_SKIPPED" };

/**
 * Pure reducer, no React, no I/O — every phase transition this app's UI
 * can reach lives here, testable without rendering anything. See
 * `session/use-assessment-session.ts` for the composition layer that
 * drives it from `AssessmentSession`.
 */
export function boutReducer(state: BoutState, action: BoutAction): BoutState {
  switch (action.type) {
    case "PROBE_READY":
      return { ...state, phase: "probing", probe: action.probe, selected: null, cue: null };

    case "SESSION_COMPLETE":
      return { ...state, phase: "closing", completionReason: action.reason, probe: null, cue: null };

    case "RESPONDED":
      // Ignore a stray/duplicate response once we've already moved past
      // "probing" (e.g. a delayed pointerup arriving after resolving
      // already started).
      if (state.phase !== "probing") return state;
      return {
        ...state,
        phase: "resolving",
        selected: action.selected,
        cue: cueForOutcome(action.correct),
        beatIndex: state.beatIndex + 1,
      };

    case "RATED":
    case "RATING_SKIPPED":
      return { ...state, ratingPhase: "settled", phase: "done" };

    default:
      return state;
  }
}
