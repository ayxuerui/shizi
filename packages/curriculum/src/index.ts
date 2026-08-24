export const PACKAGE_NAME = "@shizi/curriculum";

export type {
  ComposedBatch,
  CurriculumConfig,
  CurriculumState,
  ScoredCandidate,
  ScoringWeights,
  SelectionResult,
} from "./types.js";
export { DEFAULT_CURRICULUM_CONFIG, DEFAULT_SCORING_WEIGHTS } from "./types.js";

export { isPhaseAExhausted, selectFromPhaseA } from "./phase-a.js";
export { scoreCandidate } from "./scoring.js";
export { filterBySpacing, violatesSpacingConstraint } from "./spacing.js";
export { selectNextCharacter } from "./select.js";
export { composeBatch, composeBatchPlan } from "./batch.js";
