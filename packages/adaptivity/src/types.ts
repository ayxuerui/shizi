/** A teaching-modality identifier, e.g. "hear-tap" — this change's only implemented one. */
export type Arm = string;

export interface MatchCriteria {
  /** Max allowed absolute difference in stroke count between two characters for them to be "matched." */
  strokeCountTolerance: number;
  /** Max allowed absolute difference in frequency rank. */
  frequencyRankTolerance: number;
  /** Max allowed absolute difference in confusability-neighborhood size (how many pool characters each is confusable with). */
  confusabilityNeighborhoodTolerance: number;
}

export const DEFAULT_MATCH_CRITERIA: MatchCriteria = {
  strokeCountTolerance: 2,
  frequencyRankTolerance: 30,
  confusabilityNeighborhoodTolerance: 1,
};

export interface MatchedPair {
  characters: readonly [string, string];
}

export interface ArmAssignment {
  character: string;
  arm: Arm;
  /** Links the two assignment records produced from the same matched pair. */
  pairId: string;
  assignedAt: string;
}

/** The three allowed one-tap ratings — see `SessionRating`'s doc comment. */
export const RATING_VALUES = ["loved", "fine", "checked-out"] as const;
export type Rating = (typeof RATING_VALUES)[number];

/**
 * `adaptivity-instrumentation` spec's "Parent one-tap session rating"
 * requirement: "record it as an event associated with that session."
 * A sibling record type, not a `LearnerEvent` — `learner-state`'s
 * `EventLog` requires a character/outcome/latency that a session-level
 * rating has none of (see `validation.ts`'s equivalent discipline there).
 * This lives here, not in `learner-state`, because the requirement is
 * itself part of this package's spec capability.
 *
 * `sessionId` is the primary/idempotency key — the spec calls for
 * "exactly one simple rating prompt" per session, and the UI settles
 * `ratingPhase` after one tap, so a second rating for the same session
 * is unreachable by construction; `INSERT OR IGNORE` keyed on it (same
 * idempotency shape as `ArmAssignment`/`LearnerEvent`) makes a re-sync a
 * safe no-op.
 */
export interface SessionRating {
  sessionId: string;
  rating: Rating;
  recordedAt: string;
}
