import { useEffect } from "react";
import type { SessionDeps } from "@shizi/exposure-engine";
import type { CandidatePool } from "@shizi/character-data";
import { COPY } from "../copy.js";
import { NarrativeStage } from "../narrative/NarrativeStage.js";
import { WukongPlaceholder } from "../narrative/WukongPlaceholder.js";
import { ListenExposure } from "./ListenExposure.js";
import { TraceExposure } from "./TraceExposure.js";
import { useExposureSession } from "./use-exposure-session.js";

export interface ExposureScreenProps {
  pool: CandidatePool;
  /** The active batch's not-yet-introduced characters — caps this bout,
   * per `use-exposure-session.ts`'s doc comment. */
  characters: readonly string[];
  onDone: () => void;
  /** Overridable for tests (e.g. a fixed `random` to force deterministic
   * arm assignment). Omitted in real usage, same as `BoutScreen`'s
   * `config` prop. */
  deps?: Partial<SessionDeps>;
}

/** How long the closing beat stays on screen before the practice router
 * moves on to the next activity — long enough to register as a real
 * beat, short enough to keep the play loop moving. */
const CLOSING_HOLD_MS = 1500;

/**
 * The `learn` activity screen (`add-tracing-modality-arm`'s "Exposure is
 * a separate activity, not a probe kind or a bout segment" decision):
 * its own screen with its own completion bound, entirely separate from
 * `BoutScreen`'s assessment instrument. Resolves the next character +
 * arm via `exposure-engine` and renders the arm-specific content; always
 * reaches a positive completion regardless of interaction quality — no
 * grading, no digits, matching `BoutScreen`'s no-score-like-text
 * guarantee.
 */
export function ExposureScreen({ pool, characters, onDone, deps }: ExposureScreenProps) {
  const { state, completeItem } = useExposureSession({
    sessionId: crypto.randomUUID(),
    pool,
    characters,
    ...(deps ? { deps } : {}),
  });

  const done = state.phase === "done";

  useEffect(() => {
    if (!done) return undefined;
    const timeout = setTimeout(onDone, CLOSING_HOLD_MS);
    return () => clearTimeout(timeout);
  }, [done, onDone]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
      <NarrativeStage beatIndex={state.completedCount} complete={done} />
      {state.phase === "presenting" && state.item?.arm === "listen" && (
        <ListenExposure character={state.item.character} onComplete={completeItem} />
      )}
      {state.phase === "presenting" && state.item?.arm === "trace" && (
        <TraceExposure character={state.item.character} pool={pool} onComplete={completeItem} />
      )}
      {done && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <WukongPlaceholder />
          <h1>{COPY.closing.title}</h1>
          <p>{COPY.closing.subtitle}</p>
          {/* No parent-rating prompt here — `ParentRatingPrompt` is scoped
           * to the `assessment` capability's spec, not exposure. */}
        </div>
      )}
    </div>
  );
}
