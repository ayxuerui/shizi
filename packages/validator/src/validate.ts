import type { ValidationContext, ValidationResult, ValidatorConfig } from "./types.js";
import { DEFAULT_VALIDATOR_CONFIG } from "./types.js";
import {
  checkConfusableAdjacency,
  checkDensity,
  checkRepetitionThreshold,
  checkShakySeeding,
  checkWhitelist,
} from "./rules.js";

/**
 * Validates text against a specific learner's state, per
 * `content-validator` spec's "Structured validation result" requirement.
 * `valid` reflects only error-severity findings — warnings never block.
 */
export function validate(
  text: string,
  context: ValidationContext,
  config: ValidatorConfig = DEFAULT_VALIDATOR_CONFIG,
): ValidationResult {
  const findings = [
    ...checkWhitelist(text, context),
    ...checkRepetitionThreshold(text, context, config),
    ...checkDensity(text, context, config),
    ...checkShakySeeding(text, context, config),
    ...checkConfusableAdjacency(text, context),
  ];

  const valid = !findings.some((f) => f.severity === "error");

  return { valid, findings };
}
