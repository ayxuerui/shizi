import type { ExposureItem } from "@shizi/exposure-engine";

export type ExposureBoutPhase = "loading" | "presenting" | "done";

export interface ExposureBoutState {
  phase: ExposureBoutPhase;
  item: ExposureItem | null;
  completedCount: number;
}

export const INITIAL_EXPOSURE_BOUT_STATE: ExposureBoutState = {
  phase: "loading",
  item: null,
  completedCount: 0,
};

export type ExposureBoutAction =
  | { type: "ITEM_READY"; item: ExposureItem }
  | { type: "ITEM_COMPLETED" }
  | { type: "SESSION_COMPLETE" };

/**
 * Pure phase machine for one learn (exposure) bout — mirrors
 * `session/bout-machine.ts`'s split between a testable-without-rendering
 * reducer and the hook/component that drives it.
 */
export function exposureBoutReducer(state: ExposureBoutState, action: ExposureBoutAction): ExposureBoutState {
  switch (action.type) {
    case "ITEM_READY":
      return { ...state, phase: "presenting", item: action.item };
    case "ITEM_COMPLETED":
      return { ...state, phase: "loading", item: null, completedCount: state.completedCount + 1 };
    case "SESSION_COMPLETE":
      return { ...state, phase: "done", item: null };
    default:
      return state;
  }
}
