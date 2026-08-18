export const PACKAGE_NAME = "@shizi/validator";

export type {
  Finding,
  FindingSeverity,
  ValidationContext,
  ValidationResult,
  ValidatorConfig,
} from "./types.js";
export { DEFAULT_VALIDATOR_CONFIG } from "./types.js";

export { validate } from "./validate.js";

export {
  checkConfusableAdjacency,
  checkDensity,
  checkRepetitionThreshold,
  checkShakySeeding,
  checkWhitelist,
} from "./rules.js";

export { hanCharacterOccurrences, isHanCharacter } from "./han-characters.js";
