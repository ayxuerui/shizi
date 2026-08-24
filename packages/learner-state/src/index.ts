export const PACKAGE_NAME = "@shizi/learner-state";

export type { LearnerEvent, MasteryState, Outcome } from "./types.js";
export { REQUIRED_EVENT_FIELDS } from "./types.js";

export type { ValidationResult } from "./validation.js";
export { validateEvent } from "./validation.js";

export type { AppendResult } from "./event-log.js";
export { EventLog } from "./event-log.js";

export type { MasteryProjectionConfig } from "./mastery-projection.js";
export {
  computeMasteryStates,
  DEFAULT_MASTERY_CONFIG,
  DEFAULT_RECOGNITION_MODALITIES,
} from "./mastery-projection.js";

export { computeKnownSet } from "./known-set-projection.js";

export type { LearnerContext } from "./learner-context.js";
export { deriveLearnerContext } from "./learner-context.js";

export { exportToJsonl, parseJsonl, toJsonl, fromJsonl } from "./export.js";
