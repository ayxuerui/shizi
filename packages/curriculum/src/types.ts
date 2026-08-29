export interface CurriculumState {
  /** From learner-state's computeKnownSet — known ∪ shaky. */
  knownSet: ReadonlySet<string>;
  /**
   * Characters introduced within the "recent window," most-recently-
   * introduced last. Interpretation decision: a COUNT-based window
   * (e.g. "last N introduced"), not a time-based one — a time-based
   * window would make selection depend on wall-clock "now", breaking
   * the spec's "Selection is reproducible" requirement (same state +
   * config must always rank the same way, not "same state + config +
   * whatever moment you happened to run it").
   */
  recentlyIntroduced: readonly string[];
  /**
   * Characters already picked earlier in the batch currently being
   * composed. Confusability against this set is a hard exclusion in
   * `selectNextCharacter`, independent of `recentlyIntroduced`'s
   * count-based window — per `add-batch-scoped-activities` design
   * decision 1, intra-batch non-confusability is an explicit
   * composition constraint, not an incidental side effect of
   * `recentWindowSize`. Omitted (or empty) outside batch composition,
   * where it has no effect.
   */
  pickedInBatch?: ReadonlySet<string>;
}

export interface ScoringWeights {
  wordUnlock: number;
  storyUnlock: number;
  personalRelevance: number;
  learnability: number;
  confusabilityPenalty: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  wordUnlock: 1,
  storyUnlock: 1,
  personalRelevance: 1,
  learnability: 1,
  confusabilityPenalty: 1,
};

export interface ScoredCandidate {
  character: string;
  score: number;
  factors: {
    wordUnlock: number;
    storyUnlock: number;
    personalRelevance: number;
    learnability: number;
    confusabilityPenalty: number;
  };
}

export interface CurriculumConfig {
  /** How many of the most-recently-introduced characters the hard confusability constraint protects. */
  recentWindowSize: number;
  weights: ScoringWeights;
  /** How many characters make up one batch. Intra-batch non-confusability
   * is guaranteed explicitly (via `CurriculumState.pickedInBatch`), not
   * incidentally by `recentWindowSize` — so `batchSize` is free to exceed
   * `recentWindowSize` without silently losing that guarantee; see
   * `add-batch-scoped-activities` design.md decisions 1–2. */
  batchSize: number;
  /** How many consecutive batches `composeBatchPlan` composes ahead. */
  batchLookahead: number;
}

export const DEFAULT_CURRICULUM_CONFIG: CurriculumConfig = {
  recentWindowSize: 5,
  weights: DEFAULT_SCORING_WEIGHTS,
  batchSize: 6,
  batchLookahead: 4,
};

export type SelectionResult =
  | { status: "phase-a"; character: string }
  | { status: "phase-b"; character: string; scored: ScoredCandidate }
  | { status: "none-eligible"; reason: string };

/**
 * One batch's composition. `short` is true when fewer than `batchSize`
 * characters could be composed — per `add-batched-curriculum-tagging`
 * spec: a short batch is returned rather than violating the spacing
 * constraint or fabricating a candidate.
 */
export interface ComposedBatch {
  characters: readonly string[];
  short: boolean;
  /** Populated only when `short` is true — why composition stopped early. */
  reason?: string;
}
