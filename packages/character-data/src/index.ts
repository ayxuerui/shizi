export const PACKAGE_NAME = "@shizi/character-data";

export type {
  CandidatePool,
  CharacterAttributes,
  CharacterId,
  Concreteness,
  ConfusablePair,
  IdentityRole,
  IdentitySetEntry,
  StrokeData,
  TagSource,
} from "./types.js";

export {
  assembleCandidatePool,
  DEFERRED_TIER_2,
  IDENTITY_CHARACTERS,
  IDENTITY_SET,
  isIdentityCharacter,
  PHASE_A_SEQUENCE,
} from "./pool.js";

export { buildConfusabilityIndex, computeConfusability } from "./confusability.js";

export { isUsable, missingAttributes, partitionByUsability } from "./exclusion.js";

