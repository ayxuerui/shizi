import type { Rating } from "@shizi/adaptivity";
import { COPY } from "../copy.js";
import { WukongPlaceholder } from "../narrative/WukongPlaceholder.js";
import { ParentRatingPrompt } from "../parent/ParentRatingPrompt.js";

export interface ClosingBeatProps {
  ratingPhase: "asking" | "settled";
  onRate: (rating: Rating) => void;
  onSkipRating: () => void;
}

/**
 * Task 8.10's UI half: triggered off EITHER `session-complete` reason
 * (duration or item-count — the child never sees which one). Warm copy,
 * zero numbers, no summary — per the "no visible scoring" requirement,
 * this screen has nothing to say about how many were right.
 */
export function ClosingBeat({ ratingPhase, onRate, onSkipRating }: ClosingBeatProps) {
  return (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <WukongPlaceholder />
      <h1>{COPY.closing.title}</h1>
      <p>{COPY.closing.subtitle}</p>
      {ratingPhase === "asking" && <ParentRatingPrompt onRate={onRate} onSkip={onSkipRating} />}
    </div>
  );
}
