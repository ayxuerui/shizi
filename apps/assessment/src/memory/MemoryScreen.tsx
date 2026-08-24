import { useEffect } from "react";
import type { CandidatePool } from "@shizi/character-data";
import { COPY } from "../copy.js";
import { NarrativeStage } from "../narrative/NarrativeStage.js";
import { WukongPlaceholder } from "../narrative/WukongPlaceholder.js";
import { ProbePanel } from "../probe/ProbePanel.js";
import { useMemorySession } from "./use-memory-session.js";

export interface MemoryScreenProps {
  pool: CandidatePool;
  /** Stalest-first, already capped — from `activity-selector.ts`'s
   * `computeDueForMemory`. */
  characters: readonly string[];
  onDone: () => void;
}

const CLOSING_HOLD_MS = 1500;

/**
 * The daily-memory activity screen: a short spaced-repetition review
 * bout, reusing `ProbePanel` (the same hear→tap interaction assessment
 * uses — a memory-review probe genuinely is a recognition check, see
 * `session/memory-session.ts`'s doc comment) over a caller-supplied
 * due-list instead of frontier search. Same no-score, no-failure-state
 * discipline as `BoutScreen`: no digits, no error cue.
 */
export function MemoryScreen({ pool, characters, onDone }: MemoryScreenProps) {
  const { state, submitResponse } = useMemorySession({
    sessionId: crypto.randomUUID(),
    pool,
    dueCharacters: characters,
  });

  const done = state.phase === "done";

  useEffect(() => {
    if (!done) return undefined;
    const timeout = setTimeout(onDone, CLOSING_HOLD_MS);
    return () => clearTimeout(timeout);
  }, [done, onDone]);

  const answeredCount = characters.length > 0 ? characters.indexOf(state.probe?.character ?? "") : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
      <NarrativeStage beatIndex={Math.max(answeredCount, 0)} complete={done} />
      {(state.phase === "probing" || state.phase === "resolving") && state.probe && (
        <ProbePanel
          probe={{ character: state.probe.character, kind: "easy", options: state.probe.options }}
          disabled={state.phase === "resolving"}
          selected={state.selected}
          cue={state.cue}
          onSelect={submitResponse}
        />
      )}
      {done && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <WukongPlaceholder />
          <h1>{COPY.closing.title}</h1>
          <p>{COPY.closing.subtitle}</p>
        </div>
      )}
    </div>
  );
}
