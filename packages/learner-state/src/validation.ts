import { REQUIRED_EVENT_FIELDS, type LearnerActivity, type LearnerEvent, type LearnerModule } from "./types.js";

const LEARNER_MODULES: readonly LearnerModule[] = ["learn", "assess", "review"];
const LEARNER_ACTIVITIES: readonly LearnerActivity[] = ["listen", "trace", "hear-tap"];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Checks that every required field is *present* (not `undefined`) — not
 * that it's truthy. `daysSinceLastExposure` legitimately allows `null`
 * (first exposure), `latencyMs`/`positionInSession`/`priorExposureCount`
 * legitimately allow `0`, and `adultPresent` legitimately allows `false`.
 * A naive truthy check would wrongly reject all of those.
 */
export function validateEvent(event: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof event !== "object" || event === null) {
    return { valid: false, errors: ["event must be a non-null object"] };
  }

  const record = event as Record<string, unknown>;

  for (const field of REQUIRED_EVENT_FIELDS) {
    if (!(field in record) || record[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const typed = record as unknown as LearnerEvent;

  if (typeof typed.id !== "string" || typed.id.length === 0) {
    errors.push("id must be a non-empty string");
  }
  if (typeof typed.timestamp !== "string" || Number.isNaN(Date.parse(typed.timestamp))) {
    errors.push("timestamp must be a valid ISO 8601 string");
  }
  if (typeof typed.sessionId !== "string" || typed.sessionId.length === 0) {
    errors.push("sessionId must be a non-empty string");
  }
  if (typeof typed.character !== "string" || typed.character.length === 0) {
    errors.push("character must be a non-empty string");
  }
  if (typeof typed.module !== "string" || !LEARNER_MODULES.includes(typed.module as LearnerModule)) {
    errors.push('module must be "learn", "assess", or "review"');
  }
  if (typeof typed.activity !== "string" || !LEARNER_ACTIVITIES.includes(typed.activity as LearnerActivity)) {
    errors.push('activity must be "listen", "trace", or "hear-tap"');
  }
  if ("modality" in record) {
    // Retired field name (`rename-event-modality-to-activity`) — a row
    // still carrying it is pre-migration data that must be translated
    // before it is valid, not silently accepted.
    errors.push('retired field: "modality" (renamed to "activity" with module/activity values)');
  }
  if (typed.outcome !== "correct" && typed.outcome !== "incorrect") {
    errors.push('outcome must be "correct" or "incorrect"');
  }
  if (typeof typed.latencyMs !== "number" || typed.latencyMs < 0) {
    errors.push("latencyMs must be a non-negative number");
  }
  if (typeof typed.positionInSession !== "number" || typed.positionInSession < 0) {
    errors.push("positionInSession must be a non-negative number");
  }
  if (typeof typed.priorExposureCount !== "number" || typed.priorExposureCount < 0) {
    errors.push("priorExposureCount must be a non-negative number");
  }
  if (typed.daysSinceLastExposure !== null && typeof typed.daysSinceLastExposure !== "number") {
    errors.push("daysSinceLastExposure must be a number or null");
  }
  if (
    typeof typed.timeOfDay !== "number" ||
    typed.timeOfDay < 0 ||
    typed.timeOfDay > 23
  ) {
    errors.push("timeOfDay must be a number between 0 and 23");
  }
  if (typeof typed.adultPresent !== "boolean") {
    errors.push("adultPresent must be a boolean");
  }

  return { valid: errors.length === 0, errors };
}
