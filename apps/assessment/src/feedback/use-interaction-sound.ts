import { useCallback } from "react";
import { playViaElement } from "../audio/play.js";
import type { CueKind } from "./cues.js";

/**
 * PLACEHOLDER (flagged, not silent — see AGENT plan/design.md): the SAME
 * neutral tone plays for every cue kind. This is deliberate, not merely
 * an unfinished asset — see cues.ts's doc comment on why "acknowledge"
 * and "redirect" must never sound different. A real, distinct musical
 * sting per cue (if ever wanted) is a future asset-design decision, not
 * something to fabricate now.
 */
const CUE_URL = "/audio/interaction-cue.wav";

export function useInteractionSound(): { play: (cue: CueKind) => void } {
  const play = useCallback((_cue: CueKind) => {
    playViaElement(CUE_URL);
  }, []);
  return { play };
}
