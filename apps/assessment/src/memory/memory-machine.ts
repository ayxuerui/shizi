import type { MemoryProbeItem } from "../session/memory-session.js";
import { cueForOutcome } from "../feedback/cues.js";
import type { ResponseCue } from "../session/bout-machine.js";

export type MemoryBoutPhase = "loading" | "probing" | "resolving" | "done";

export interface MemoryBoutState {
  phase: MemoryBoutPhase;
  probe: MemoryProbeItem | null;
  selected: string | null;
  cue: ResponseCue | null;
}

export const INITIAL_MEMORY_BOUT_STATE: MemoryBoutState = {
  phase: "loading",
  probe: null,
  selected: null,
  cue: null,
};

export type MemoryBoutAction =
  | { type: "PROBE_READY"; probe: MemoryProbeItem }
  | { type: "SESSION_COMPLETE" }
  | { type: "RESPONDED"; selected: string; correct: boolean };

/**
 * Pure phase machine for a daily-memory review bout — mirrors
 * `session/bout-machine.ts`'s shape (no score/accuracy field anywhere;
 * `cue` is the same acknowledge/redirect union with no error member),
 * simplified since memory review has no rating step and no duration
 * bound to track.
 */
export function memoryBoutReducer(state: MemoryBoutState, action: MemoryBoutAction): MemoryBoutState {
  switch (action.type) {
    case "PROBE_READY":
      return { ...state, phase: "probing", probe: action.probe, selected: null, cue: null };
    case "SESSION_COMPLETE":
      return { ...state, phase: "done", probe: null, cue: null };
    case "RESPONDED":
      if (state.phase !== "probing") return state;
      return { ...state, phase: "resolving", selected: action.selected, cue: cueForOutcome(action.correct) };
    default:
      return state;
  }
}
