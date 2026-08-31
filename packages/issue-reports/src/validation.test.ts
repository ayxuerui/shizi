import { describe, expect, it } from "vitest";
import { validateIssueReport } from "./validation.js";
import {
  MAX_CONTEXT_FIELD_LENGTH,
  MAX_MESSAGE_LENGTH,
  REQUIRED_CONTEXT_FIELDS,
  REQUIRED_REPORT_FIELDS,
  type IssueReport,
  type IssueReportContext,
} from "./types.js";

function validContext(overrides: Partial<IssueReportContext> = {}): IssueReportContext {
  return {
    appEnv: "prod",
    buildId: "abc1234",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
    standalone: true,
    online: false,
    lastSessionId: "session-1",
    lastActivity: "assess/hear-tap",
    ...overrides,
  };
}

function validReport(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    id: "report-1",
    kind: "bug",
    message: "The audio did not play for 山.",
    createdAt: "2026-08-29T10:00:00.000Z",
    context: validContext(),
    ...overrides,
  };
}

describe("validateIssueReport (issue-reporting spec: 'Same validation on both ends')", () => {
  it("accepts a fully-populated bug report", () => {
    expect(validateIssueReport(validReport())).toEqual({ valid: true, errors: [] });
  });

  it("accepts a feature request", () => {
    expect(validateIssueReport(validReport({ kind: "feature" }))).toEqual({ valid: true, errors: [] });
  });

  it("reports each missing top-level field by name", () => {
    for (const field of REQUIRED_REPORT_FIELDS) {
      const { [field]: _dropped, ...missing } = validReport();
      const result = validateIssueReport(missing);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`missing required field: ${field}`);
    }
  });

  it("reports each missing context field by name", () => {
    for (const field of REQUIRED_CONTEXT_FIELDS) {
      const { [field]: _dropped, ...missingContext } = validContext();
      const result = validateIssueReport({ ...validReport(), context: missingContext });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`missing required field: context.${field}`);
    }
  });

  it("rejects a kind outside the allowed set", () => {
    const result = validateIssueReport({ ...validReport(), kind: "question" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("kind must be one of"))).toBe(true);
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(validateIssueReport(validReport({ message: "" })).valid).toBe(false);
    const result = validateIssueReport(validReport({ message: "   \n\t " }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("message must not be empty");
  });

  it("accepts a message of exactly the maximum length and rejects one character more", () => {
    expect(validateIssueReport(validReport({ message: "x".repeat(MAX_MESSAGE_LENGTH) })).valid).toBe(true);
    const result = validateIssueReport(validReport({ message: "x".repeat(MAX_MESSAGE_LENGTH + 1) }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  });

  it("rejects an over-length context string field", () => {
    const result = validateIssueReport(
      validReport({ context: validContext({ userAgent: "u".repeat(MAX_CONTEXT_FIELD_LENGTH + 1) }) }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(`context.userAgent must be at most ${MAX_CONTEXT_FIELD_LENGTH} characters`);
  });

  it("accepts null lastSessionId/lastActivity (a fresh device) but not an absent one", () => {
    expect(
      validateIssueReport(validReport({ context: validContext({ lastSessionId: null, lastActivity: null }) })).valid,
    ).toBe(true);
    const { lastSessionId: _dropped, ...withoutLastSession } = validContext();
    const result = validateIssueReport({ ...validReport(), context: withoutLastSession });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required field: context.lastSessionId");
  });

  it("rejects a non-boolean standalone/online", () => {
    const result = validateIssueReport({
      ...validReport(),
      context: { ...validContext(), standalone: "yes", online: 1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("context.standalone must be a boolean");
    expect(result.errors).toContain("context.online must be a boolean");
  });

  it("rejects an empty id", () => {
    expect(validateIssueReport(validReport({ id: "" })).valid).toBe(false);
  });

  it("rejects a non-ISO createdAt", () => {
    const result = validateIssueReport(validReport({ createdAt: "yesterday" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("createdAt must be a valid ISO 8601 string");
  });

  it("rejects a non-object value with a single error, without throwing", () => {
    expect(validateIssueReport(null)).toEqual({ valid: false, errors: ["issue report must be a non-null object"] });
    expect(validateIssueReport("report").valid).toBe(false);
    expect(validateIssueReport({ ...validReport(), context: "ctx" }).errors).toEqual([
      "context must be a non-null object",
    ]);
  });
});
