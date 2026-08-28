import { useEffect, useMemo, useRef } from "react";
import type { AssessmentSessionConfig } from "@shizi/assessment-engine";
import type { CandidatePool } from "@shizi/character-data";
import { ClosingBeat } from "../closing/ClosingBeat.js";
import { ContinueTap } from "../closing/ContinueTap.js";
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
  /** Restricts informative probes to these characters — the active
   * batch's unresolved members (`learning-orchestration` spec). Omitted
   * (or empty) runs an unfocused, whole-pool bout, exactly as every
   * existing test/usage that omits this prop behaved before it existed. */
  characters?: readonly string[];
  config?: AssessmentSessionConfig;
  /** Called once the parent has rated (or skipped rating) and the bout
   * has fully settled (`phase === "done"`). Optional — omitted by
   * existing tests/usages, which just leave the closing beat on screen
   * indefinitely, exactly as before this prop existed. */
  onDone?: () => void;
}

/**
 * Thin composition: `NarrativeStage` is always mounted (the beat/progress
 * display); `ProbePanel` renders during probing/resolving; `ClosingBeat`
 * takes over once the session completes. All the actual state lives in
 * `useAssessmentSession` — this component just maps `BoutState` to markup.
 */
export function BoutScreen({ pool: poolProp, characters, config, onDone }: BoutScreenProps = {}) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const pool = useMemo(() => poolProp ?? loadCandidatePool(), [poolProp]);
  const { state, submitResponse, rate, skipRating, timing } = useAssessmentSession({
    sessionId,
    pool,
    ...(characters ? { focusCharacters: characters } : {}),
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
      <NarrativeStage
        beatIndex={state.beatIndex}
        timing={timing}
        complete={state.phase === "closing" || state.phase === "done"}
      />
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
        <ClosingBeat ratingPhase={state.ratingPhase} onRate={rate} onSkipRating={skipRating} />
      )}
      {state.phase === "done" && onDone && <ContinueTap onContinue={onDone} />}
    </div>
  );
}
