import {
  ISSUE_KINDS,
  MAX_CONTEXT_FIELD_LENGTH,
  MAX_MESSAGE_LENGTH,
  REQUIRED_CONTEXT_FIELDS,
  REQUIRED_REPORT_FIELDS,
  type IssueReport,
} from "./types.js";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function checkBoundedString(value: unknown, name: string, errors: string[]): void {
  if (typeof value !== "string") {
    errors.push(`${name} must be a string`);
  } else if (value.length > MAX_CONTEXT_FIELD_LENGTH) {
    errors.push(`${name} must be at most ${MAX_CONTEXT_FIELD_LENGTH} characters`);
  }
}

/**
 * One validator, three call sites (client enqueue-on-write, client
 * re-validate-on-read, server-side defense-in-depth) — the same
 * discipline as `learner-state`'s `validateEvent` and `adaptivity`'s
 * `validateSessionRating`, so the allowed kinds and size bounds can't
 * drift between the device and the sync service (spec: "Same validation
 * on both ends"). Checks presence (not truthiness) first, then per-field
 * shape and bounds; a `null` `lastSessionId`/`lastActivity` is present
 * and valid, an absent one is not.
 */
export function validateIssueReport(report: unknown): ValidationResult {
  if (typeof report !== "object" || report === null) {
    return { valid: false, errors: ["issue report must be a non-null object"] };
  }

  const record = report as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of REQUIRED_REPORT_FIELDS) {
    if (!(field in record) || record[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (typeof record.context !== "object" || record.context === null) {
    return { valid: false, errors: ["context must be a non-null object"] };
  }
  const contextRecord = record.context as Record<string, unknown>;
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    if (!(field in contextRecord) || contextRecord[field] === undefined) {
      errors.push(`missing required field: context.${field}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const typed = record as unknown as IssueReport;

  if (typeof typed.id !== "string" || typed.id.length === 0) {
    errors.push("id must be a non-empty string");
  }
  if (!(ISSUE_KINDS as readonly string[]).includes(typed.kind)) {
    errors.push(`kind must be one of: ${ISSUE_KINDS.join(", ")}`);
  }
  if (typeof typed.message !== "string") {
    errors.push("message must be a string");
  } else {
    if (typed.message.trim().length === 0) {
      errors.push("message must not be empty");
    }
    if (typed.message.length > MAX_MESSAGE_LENGTH) {
      errors.push(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
    }
  }
  if (typeof typed.createdAt !== "string" || Number.isNaN(Date.parse(typed.createdAt))) {
    errors.push("createdAt must be a valid ISO 8601 string");
  }

  const context = typed.context;
  checkBoundedString(context.appEnv, "context.appEnv", errors);
  checkBoundedString(context.buildId, "context.buildId", errors);
  checkBoundedString(context.userAgent, "context.userAgent", errors);
  if (typeof context.standalone !== "boolean") {
    errors.push("context.standalone must be a boolean");
  }
  if (typeof context.online !== "boolean") {
    errors.push("context.online must be a boolean");
  }
  if (context.lastSessionId !== null) {
    checkBoundedString(context.lastSessionId, "context.lastSessionId", errors);
  }
  if (context.lastActivity !== null) {
    checkBoundedString(context.lastActivity, "context.lastActivity", errors);
  }

  return { valid: errors.length === 0, errors };
}
