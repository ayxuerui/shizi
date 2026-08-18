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
