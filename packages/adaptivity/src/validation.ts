import { RATING_VALUES, type SessionRating } from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * One validator, three call sites (client enqueue-on-write, client
 * re-validate-on-read, server-side defense-in-depth — mirroring
 * `learner-state`'s `validateEvent`), so the allowed rating values can't
 * drift between them. Checks presence (not truthiness) the same way
 * `validateEvent` does, even though every field here happens to be a
 * non-empty string — keeping the same discipline avoids this silently
 * diverging if a field is ever added.
 */
export function validateSessionRating(rating: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof rating !== "object" || rating === null) {
    return { valid: false, errors: ["session rating must be a non-null object"] };
  }

  const record = rating as Record<string, unknown>;

  for (const field of ["sessionId", "rating", "recordedAt"] as const) {
    if (!(field in record) || record[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const typed = record as unknown as SessionRating;

  if (typeof typed.sessionId !== "string" || typed.sessionId.length === 0) {
    errors.push("sessionId must be a non-empty string");
  }
  if (!(RATING_VALUES as readonly string[]).includes(typed.rating)) {
    errors.push(`rating must be one of: ${RATING_VALUES.join(", ")}`);
  }
  if (typeof typed.recordedAt !== "string" || Number.isNaN(Date.parse(typed.recordedAt))) {
    errors.push("recordedAt must be a valid ISO 8601 string");
  }

  return { valid: errors.length === 0, errors };
}
