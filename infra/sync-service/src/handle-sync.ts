import { validateEvent, type LearnerEvent } from "@shizi/learner-state";
import { validateSessionRating, type ArmAssignment, type SessionRating } from "@shizi/adaptivity";
import { validateIssueReport, type IssueReport } from "@shizi/issue-reports";
import { checkAuth } from "./auth.js";
import type { EventStore } from "./db.js";

export interface SyncRequestInput {
  authHeader: string | undefined | null;
  bodyText: string;
}

export interface SyncDeps {
  expectedToken: string;
  store: EventStore;
}

export type SyncResponseResult =
  | { status: 401; body: { error: "unauthorized" } }
  | { status: 400; body: { error: string } }
  | { status: 200; body: { inserted: number; duplicates: number; rejected: number; errors?: string[] } };

function parseNdjson(text: string): unknown[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function isValidAssignment(value: unknown): value is ArmAssignment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.character === "string" &&
    typeof record.arm === "string" &&
    typeof record.pairId === "string" &&
    typeof record.assignedAt === "string"
  );
}

/**
 * Task 9.2's core logic for both routes — pure function of
 * {authHeader, bodyText} + injected deps, with no Node `http` types
 * anywhere in its signature. `server.ts` is the only file that knows
 * about `IncomingMessage`/`ServerResponse`; a future move to a real
 * Cloudflare Worker (if the user's situation changes) would only need a
 * thin adapter around these two functions, not a rewrite of the logic.
 */
export function handleEventsSync(input: SyncRequestInput, deps: SyncDeps): SyncResponseResult {
  if (!checkAuth(input.authHeader, deps.expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  let candidates: unknown[];
  try {
    candidates = parseNdjson(input.bodyText);
  } catch {
    return { status: 400, body: { error: "malformed NDJSON body" } };
  }

  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    // Defense in depth: the client already validates before sending
    // (learner-state's own EventLog), but this endpoint doesn't trust
    // that blindly — a malformed event must not silently corrupt the
    // durable store.
    const result = validateEvent(candidate);
    if (!result.valid) {
      rejected += 1;
      errors.push(...result.errors);
      continue;
    }
    const { inserted: wasInserted } = deps.store.insertEvent(candidate as LearnerEvent);
    if (wasInserted) inserted += 1;
    else duplicates += 1;
  }

  return {
    status: 200,
    body: { inserted, duplicates, rejected, ...(errors.length > 0 ? { errors } : {}) },
  };
}

export function handleAssignmentsSync(input: SyncRequestInput, deps: SyncDeps): SyncResponseResult {
  if (!checkAuth(input.authHeader, deps.expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  let candidates: unknown[];
  try {
    candidates = parseNdjson(input.bodyText);
  } catch {
    return { status: 400, body: { error: "malformed NDJSON body" } };
  }

  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const candidate of candidates) {
    if (!isValidAssignment(candidate)) {
      rejected += 1;
      continue;
    }
    const { inserted: wasInserted } = deps.store.insertAssignment(candidate);
    if (wasInserted) inserted += 1;
    else duplicates += 1;
  }

  return { status: 200, body: { inserted, duplicates, rejected } };
}

/**
 * `adaptivity-instrumentation` spec's "Parent one-tap session rating".
 * Reuses `validateSessionRating` from `@shizi/adaptivity` — the same
 * validator the client uses on enqueue/re-read — rather than a
 * hand-rolled structural guard like `isValidAssignment` above, so the
 * allowed rating values can't drift between client and server.
 */
export function handleRatingsSync(input: SyncRequestInput, deps: SyncDeps): SyncResponseResult {
  if (!checkAuth(input.authHeader, deps.expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  let candidates: unknown[];
  try {
    candidates = parseNdjson(input.bodyText);
  } catch {
    return { status: 400, body: { error: "malformed NDJSON body" } };
  }

  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    const result = validateSessionRating(candidate);
    if (!result.valid) {
      rejected += 1;
      errors.push(...result.errors);
      continue;
    }
    const { inserted: wasInserted } = deps.store.insertRating(candidate as SessionRating);
    if (wasInserted) inserted += 1;
    else duplicates += 1;
  }

  return {
    status: 200,
    body: { inserted, duplicates, rejected, ...(errors.length > 0 ? { errors } : {}) },
  };
}

/**
 * `issue-reporting` spec's "The sync endpoint accepts reports under the
 * existing authorization and validation discipline". Structurally
 * identical to `handleRatingsSync`, and for the same reason it reuses
 * `validateIssueReport` from `@shizi/issue-reports` rather than a local
 * structural guard: it's the validator the client already ran before
 * storing the report locally, so a report accepted on the device can't
 * be rejected here for a schema reason ("Same validation on both ends").
 */
export function handleIssueReportsSync(input: SyncRequestInput, deps: SyncDeps): SyncResponseResult {
  if (!checkAuth(input.authHeader, deps.expectedToken)) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  let candidates: unknown[];
  try {
    candidates = parseNdjson(input.bodyText);
  } catch {
    return { status: 400, body: { error: "malformed NDJSON body" } };
  }

  let inserted = 0;
  let duplicates = 0;
  let rejected = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    const result = validateIssueReport(candidate);
    if (!result.valid) {
      rejected += 1;
      errors.push(...result.errors);
      continue;
    }
    const { inserted: wasInserted } = deps.store.insertIssueReport(candidate as IssueReport);
    if (wasInserted) inserted += 1;
    else duplicates += 1;
  }

  return {
    status: 200,
    body: { inserted, duplicates, rejected, ...(errors.length > 0 ? { errors } : {}) },
  };
}
