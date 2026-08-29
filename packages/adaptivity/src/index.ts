export const PACKAGE_NAME = "@shizi/adaptivity";

export type { Arm, ArmAssignment, MatchCriteria, MatchedPair, Rating, SessionRating } from "./types.js";
export { DEFAULT_MATCH_CRITERIA, RATING_VALUES } from "./types.js";

export { findMatchedPairs, isMatchedPair } from "./matching.js";

export type { AssignmentDeps } from "./assignment.js";
export { assignPairToArms, AssignmentLog, findAssignmentForCharacter } from "./assignment.js";

export type { ValidationResult } from "./validation.js";
export { validateSessionRating } from "./validation.js";
