export type FindingSeverity = "error" | "warning";

export interface Finding {
  /** Machine-readable rule id, e.g. "whitelist", "repetition-threshold". */
  rule: string;
  severity: FindingSeverity;
  message: string;
  character?: string;
  /** 0-indexed position in the text, when the finding is about a specific character occurrence. */
  location?: number;
}

/** Per `content-validator` spec's "Structured validation result" requirement. */
export interface ValidationResult {
  /** True iff there are no error-severity findings. Warnings alone don't invalidate. */
  valid: boolean;
  findings: Finding[];
}

export interface ValidationContext {
  identitySet: ReadonlySet<string>;
  /**
   * The learner's known productive-set. Per `learner-state`'s
   * `computeKnownSet`, this already includes `shaky` characters (shaky =
   * "known but due for review," still usable in text) — this validator
   * does not need to know the difference for the whitelist check.
   */
  knownSet: ReadonlySet<string>;
  /** Specifically the shaky subset, for the seeding advisory only. */
  shakySet: ReadonlySet<string>;
  /** Characters this specific text is introducing, declared up front. */
  newTargets: ReadonlySet<string>;
  /** From `character-data`'s confusability computation, if available. */
  confusabilityIndex?: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface ValidatorConfig {
  minRepetitionForNewTarget: number;
  maxNewCharacterDensity: number;
  targetShakyDensity: number;
}

export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  minRepetitionForNewTarget: 8,
  maxNewCharacterDensity: 0.05,
  targetShakyDensity: 1 / 40,
};
