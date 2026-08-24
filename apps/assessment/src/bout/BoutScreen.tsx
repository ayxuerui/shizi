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
  /** Called once the parent has rated (or skipped rating) and the bout
   * has fully settled (`phase === "done"`). Optional — omitted by
   * existing tests/usages, which just leave the closing beat on screen
   * indefinitely, exactly as before this prop existed. */
  onDone?: () => void;
}

/** Mirrors ExposureScreen/MemoryScreen's closing hold, for a consistent
 * pause before the practice router advances to the next activity. */
const DONE_ADVANCE_DELAY_MS = 1500;

/**
 * Thin composition: `NarrativeStage` is always mounted (the beat/progress
 * display); `ProbePanel` renders during probing/resolving; `ClosingBeat`
 * takes over once the session completes. All the actual state lives in
 * `useAssessmentSession` — this component just maps `BoutState` to markup.
 */
export function BoutScreen({ pool: poolProp, config, onDone }: BoutScreenProps = {}) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const pool = useMemo(() => poolProp ?? loadCandidatePool(), [poolProp]);
  const { state, submitResponse, rate, skipRating, timing } = useAssessmentSession({
    sessionId,
    pool,
    ...(config ? { config } : {}),
  });
  const { play } = useInteractionSound();

  useEffect(() => {
    if (state.phase !== "done" || !onDone) return undefined;
    const timeout = setTimeout(onDone, DONE_ADVANCE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [state.phase, onDone]);

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
    </div>
  );
}
