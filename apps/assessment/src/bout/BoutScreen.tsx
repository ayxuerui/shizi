import { useEffect, useMemo, useRef } from "react";
import type { AssessmentSessionConfig } from "@shizi/assessment-engine";
import type { CandidatePool } from "@shizi/character-data";
import { ClosingBeat } from "../closing/ClosingBeat.js";
import { useInteractionSound } from "../feedback/use-interaction-sound.js";
import { NarrativeStage } from "../narrative/NarrativeStage.js";
import { ProbePanel } from "../probe/ProbePanel.js";
import { loadCandidatePool } from "../session/pool.js";
import { useAssessmentSession } from "../session/use-assessment-session.js";

export interface BoutScreenProps {
  /** Overridable for real usage (task 9.4's published `config.json`, via
   * `App.tsx`) and for tests (e.g. a tiny `maxItems` to reach
   * `session-complete` quickly). Defaults to the bundled pool/engine
   * default when omitted, so every existing test that constructs
   * `<BoutScreen>` with no props keeps working unchanged. */
  pool?: CandidatePool;
  config?: AssessmentSessionConfig;
}

/**
 * Thin composition: `NarrativeStage` is always mounted (the beat/progress
 * display); `ProbePanel` renders during probing/resolving; `ClosingBeat`
 * takes over once the session completes. All the actual state lives in
 * `useAssessmentSession` — this component just maps `BoutState` to markup.
 */
export function BoutScreen({ pool: poolProp, config }: BoutScreenProps = {}) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const pool = useMemo(() => poolProp ?? loadCandidatePool(), [poolProp]);
  const { state, submitResponse, rate, skipRating } = useAssessmentSession({
    sessionId,
    pool,
    ...(config ? { config } : {}),
  });
  const { play } = useInteractionSound();

  const lastCueRef = useRef<typeof state.cue>(null);
  useEffect(() => {
    if (state.cue && state.cue !== lastCueRef.current) {
      play(state.cue);
    }
    lastCueRef.current = state.cue;
  }, [state.cue, play]);

  const lastBeatRef = useRef(state.beatIndex);
  useEffect(() => {
    if (state.beatIndex !== lastBeatRef.current) {
      play("advance");
      lastBeatRef.current = state.beatIndex;
    }
  }, [state.beatIndex, play]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
      <NarrativeStage beatIndex={state.beatIndex} />
      {(state.phase === "probing" || state.phase === "resolving") && state.probe && (
        <ProbePanel
          probe={state.probe}
          disabled={state.phase === "resolving"}
          selected={state.selected}
          cue={state.cue}
          onSelect={submitResponse}
        />
      )}
      {(state.phase === "closing" || state.phase === "done") && (
        <ClosingBeat
          sessionId={sessionId}
          ratingPhase={state.ratingPhase}
          onRate={rate}
          onSkipRating={skipRating}
        />
      )}
    </div>
  );
}
