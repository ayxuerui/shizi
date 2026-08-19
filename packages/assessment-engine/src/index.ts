export const PACKAGE_NAME = "@shizi/assessment-engine";

export { computeDifficultyIndex } from "./difficulty.js";

export type { FrontierBounds, FrontierCandidate } from "./frontier.js";
export { buildFrontierCandidates, computeFrontierBounds, selectNextFrontierProbe } from "./frontier.js";

export type { GuessClassification, GuessDetectionConfig } from "./guess-detection.js";
export { classifyResponse } from "./guess-detection.js";

export type { DilutionConfig } from "./dilution.js";
export { DEFAULT_DILUTION_CONFIG, isInformativeSlot, pickEasyItem } from "./dilution.js";

export type { CalibrationConfig } from "./calibration.js";
export { DEFAULT_CALIBRATION_CONFIG, computeRollingAccuracy, nextConfusabilityLevel } from "./calibration.js";

export type { RandomDeps } from "./distractors.js";
export { pickDistractors, shuffled } from "./distractors.js";

export type {
  AssessmentSessionConfig,
  NextProbeResult,
  ProbeItem,
  ProbeKind,
  RecordResponseInput,
  RecordResponseResult,
  SessionDeps,
} from "./types.js";
export { DEFAULT_ASSESSMENT_SESSION_CONFIG } from "./types.js";

export type { CreateAssessmentSessionOptions } from "./session.js";
export { AssessmentSession } from "./session.js";
