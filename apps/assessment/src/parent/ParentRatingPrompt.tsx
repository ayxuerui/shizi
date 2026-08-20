import type { Rating } from "@shizi/adaptivity";
import { TapTarget } from "../components/TapTarget.js";
import { COPY } from "../copy.js";

export interface ParentRatingPromptProps {
  onRate: (rating: Rating) => void;
  onSkip: () => void;
}

/**
 * Task 7.4: a small, parent-facing (not child-facing) end-of-session
 * prompt. Skip is always available and this never blocks anything —
 * every assessment event for this bout is already persisted by the time
 * this renders (see `ClosingBeat`'s trigger, off `session-complete`).
 *
 * Purely presentational: it reports the chosen `Rating` upward and does
 * no persistence itself — `session/use-assessment-session.ts`'s `rate()`
 * owns that, the same seam `onEvent`/`onAssignments` already use.
 */
export function ParentRatingPrompt({ onRate, onSkip }: ParentRatingPromptProps) {
  const rate = (rating: Rating): void => {
    onRate(rating);
  };

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <p>{COPY.parentRating.prompt}</p>
      <div style={{ display: "flex", gap: "var(--tap-gap)", justifyContent: "center", flexWrap: "wrap" }}>
        <TapTarget label={COPY.parentRating.loved.label} onActivate={() => rate("loved")}>
          <span>{COPY.parentRating.loved.glyph}</span>
        </TapTarget>
        <TapTarget label={COPY.parentRating.fine.label} onActivate={() => rate("fine")}>
          <span>{COPY.parentRating.fine.glyph}</span>
        </TapTarget>
        <TapTarget label={COPY.parentRating.checkedOut.label} onActivate={() => rate("checked-out")}>
          <span>{COPY.parentRating.checkedOut.glyph}</span>
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
