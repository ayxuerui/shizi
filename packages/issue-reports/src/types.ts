/**
 * `issue-reporting` spec: the record an accompanying adult files from
 * inside the app — a bug report or a feature request — on its way from
 * the device's offline outbox to `data/events/issue-reports.jsonl`.
 *
 * A sibling record type to `LearnerEvent` and `SessionRating`, not a
 * variant of either: a report has no character, outcome, or session of
 * its own. It lives in its own package (not `@shizi/adaptivity`, where
 * `SessionRating` lives, nor `@shizi/learner-state`) because it is
 * neither adaptivity instrumentation nor learner state — see
 * add-issue-reporting's design.md.
 *
 * `id` is the primary/idempotency key: client-generated (`crypto.randomUUID()`),
 * so `INSERT OR IGNORE` keyed on it makes a re-sync after a dropped
 * connection a safe no-op — the same shape `LearnerEvent.id` and
 * `SessionRating.sessionId` already use.
 */

/** The two kinds the report form offers — "something went wrong" / "I have an idea". */
export const ISSUE_KINDS = ["bug", "feature"] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

/**
 * Upper bound on a report's free-text message, in UTF-16 code units —
 * what both `String.prototype.length` and a `<textarea maxLength>`
 * count, so the form's hard stop and this validator agree exactly.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/** Upper bound on each string field of `IssueReportContext`. */
export const MAX_CONTEXT_FIELD_LENGTH = 256;

/**
 * What the app attaches to every report without the adult typing any of
 * it (spec: "Reports carry diagnostic context automatically").
 * `lastSessionId`/`lastActivity` are present-but-nullable rather than
 * optional, deliberately: a fresh device yields `null`, never an absent
 * key, so every exported JSONL line is self-describing and the server's
 * validation can insist on the field.
 */
export interface IssueReportContext {
  /** `VITE_APP_ENV` of the build, defaulting to `"prod"` when unset. */
  appEnv: string;
  /** `VITE_BUILD_ID` of the build, or the literal `"unknown"`. */
  buildId: string;
  userAgent: string;
  /** Running installed to the home screen (display-mode: standalone). */
  standalone: boolean;
  /** `navigator.onLine` at the moment the report was written. */
  online: boolean;
  /** Session id of the most recent learner event on this device, if any. */
  lastSessionId: string | null;
  /** `"<module>/<activity>"` of that same most recent event, if any. */
  lastActivity: string | null;
}

export interface IssueReport {
  /** Client-generated, globally unique. Re-appending the same id is a no-op, not an error. */
  id: string;
  kind: IssueKind;
  /** Trimmed, non-empty, at most `MAX_MESSAGE_LENGTH` code units. */
  message: string;
  /** ISO 8601 UTC timestamp of when the adult saved it. */
  createdAt: string;
  context: IssueReportContext;
}

/** Fields required on every report, used by validation.ts. Kept next to
 * the type so the required-field list can't drift from it — same
 * single-source-of-truth pattern as `learner-state`'s `REQUIRED_EVENT_FIELDS`. */
export const REQUIRED_REPORT_FIELDS: ReadonlyArray<keyof IssueReport> = [
  "id",
  "kind",
  "message",
  "createdAt",
  "context",
];

export const REQUIRED_CONTEXT_FIELDS: ReadonlyArray<keyof IssueReportContext> = [
  "appEnv",
  "buildId",
  "userAgent",
  "standalone",
  "online",
  "lastSessionId",
  "lastActivity",
];
