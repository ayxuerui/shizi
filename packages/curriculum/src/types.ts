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
}

export const DEFAULT_CURRICULUM_CONFIG: CurriculumConfig = {
  recentWindowSize: 5,
  weights: DEFAULT_SCORING_WEIGHTS,
};

export type SelectionResult =
  | { status: "phase-a"; character: string }
  | { status: "phase-b"; character: string; scored: ScoredCandidate }
  | { status: "none-eligible"; reason: string };
