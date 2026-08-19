import { TapTarget } from "../components/TapTarget.js";
import { COPY } from "../copy.js";
import { recordRating, type Rating } from "./rating.js";

export interface ParentRatingPromptProps {
  sessionId: string;
  onRate: () => void;
  onSkip: () => void;
}

/**
 * Task 7.4: a small, parent-facing (not child-facing) end-of-session
 * prompt. Skip is always available and this never blocks anything —
 * every assessment event for this bout is already persisted by the time
 * this renders (see `ClosingBeat`'s trigger, off `session-complete`).
 */
export function ParentRatingPrompt({ sessionId, onRate, onSkip }: ParentRatingPromptProps) {
  const rate = (rating: Rating): void => {
    recordRating({ sessionId, rating, recordedAt: new Date().toISOString() });
    onRate();
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <p>{COPY.parentRating.prompt}</p>
      <div style={{ display: "flex", gap: "var(--tap-gap)", justifyContent: "center", flexWrap: "wrap" }}>
        <TapTarget label={COPY.parentRating.loved} onActivate={() => rate("loved")}>
          <span>{COPY.parentRating.loved}</span>
        </TapTarget>
        <TapTarget label={COPY.parentRating.fine} onActivate={() => rate("fine")}>
          <span>{COPY.parentRating.fine}</span>
        </TapTarget>
        <TapTarget label={COPY.parentRating.checkedOut} onActivate={() => rate("checked-out")}>
          <span>{COPY.parentRating.checkedOut}</span>
        </TapTarget>
      </div>
      <div style={{ marginTop: "0.5rem" }}>
        <TapTarget label={COPY.parentRating.skip} onActivate={onSkip}>
          <span>{COPY.parentRating.skip}</span>
        </TapTarget>
      </div>
    </div>
  );
}
