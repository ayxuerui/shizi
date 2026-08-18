export const PACKAGE_NAME = "@shizi/adaptivity";

export type { Arm, ArmAssignment, MatchCriteria, MatchedPair } from "./types.js";
export { DEFAULT_MATCH_CRITERIA } from "./types.js";

export { findMatchedPairs, isMatchedPair } from "./matching.js";

export type { AssignmentDeps } from "./assignment.js";
export { assignPairToArms, AssignmentLog } from "./assignment.js";
