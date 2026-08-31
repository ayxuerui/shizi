import { describe, expect, it } from "vitest";
import { MAX_CONTEXT_FIELD_LENGTH, validateIssueReport } from "@shizi/issue-reports";
import type { LearnerEvent } from "@shizi/learner-state";
import { collectIssueContext, type IssueContextDeps } from "./issue-context.js";

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    module: "assess",
    activity: "hear-tap",
    outcome: "correct",
    latencyMs: 900,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

function deps(overrides: Partial<IssueContextDeps> = {}): IssueContextDeps {
  return {
    appEnv: "dev",
    buildId: "abc1234",
    userAgent: "Mozilla/5.0 (iPad)",
    isOnline: () => true,
    loadPriorEvents: async () => [],
    ...overrides,
  };
}

describe("collectIssueContext (issue-reporting spec: 'Reports carry diagnostic context automatically')", () => {
  it("takes lastSessionId/lastActivity from the most recent event by timestamp", async () => {
    const context = await collectIssueContext(
      deps({
        loadPriorEvents: async () => [
          makeEvent({ id: "old", sessionId: "s-old", timestamp: "2026-08-19T09:00:00.000Z" }),
          makeEvent({
            id: "new",
            sessionId: "s-new",
            module: "learn",
            activity: "trace",
            timestamp: "2026-08-28T09:00:00.000Z",
          }),
          makeEvent({ id: "mid", sessionId: "s-mid", timestamp: "2026-08-20T09:00:00.000Z" }),
        ],
      }),
    );
    expect(context.lastSessionId).toBe("s-new");
    expect(context.lastActivity).toBe("learn/trace");
  });

  it("yields explicit nulls, not absent fields, on a device with no events", async () => {
    const context = await collectIssueContext(deps());
    expect(context.lastSessionId).toBeNull();
    expect(context.lastActivity).toBeNull();
    expect(Object.keys(context).sort()).toEqual(
      ["appEnv", "buildId", "userAgent", "standalone", "online", "lastSessionId", "lastActivity"].sort(),
    );
  });

  it("defaults appEnv to prod and buildId to unknown when the build supplied neither", async () => {
    const context = await collectIssueContext(deps({ appEnv: undefined, buildId: undefined }));
    expect(context.appEnv).toBe("prod");
    expect(context.buildId).toBe("unknown");
  });

  it("passes a non-production environment through", async () => {
    expect((await collectIssueContext(deps({ appEnv: "dev" }))).appEnv).toBe("dev");
  });

  it("reports standalone from display-mode, or from the legacy iOS flag", async () => {
    const viaMedia = await collectIssueContext(
      deps({ matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" }) }),
    );
    expect(viaMedia.standalone).toBe(true);
    const viaLegacy = await collectIssueContext(deps({ navigatorStandalone: true }));
    expect(viaLegacy.standalone).toBe(true);
    const neither = await collectIssueContext(deps({ matchMedia: () => ({ matches: false }) }));
    expect(neither.standalone).toBe(false);
  });

  it("records online state at the moment of writing", async () => {
    expect((await collectIssueContext(deps({ isOnline: () => false }))).online).toBe(false);
    expect((await collectIssueContext(deps({ isOnline: () => true }))).online).toBe(true);
  });

  it("clamps an over-long user agent so the report still validates", async () => {
    const context = await collectIssueContext(deps({ userAgent: "u".repeat(MAX_CONTEXT_FIELD_LENGTH + 50) }));
    expect(context.userAgent).toHaveLength(MAX_CONTEXT_FIELD_LENGTH);
    expect(
      validateIssueReport({ id: "r", kind: "bug", message: "x", createdAt: "2026-08-29T10:00:00.000Z", context }),
    ).toEqual({ valid: true, errors: [] });
  });

  it("still produces a context when loading local history throws", async () => {
    const context = await collectIssueContext(
      deps({
        loadPriorEvents: async () => {
          throw new Error("storage unavailable");
        },
      }),
    );
    expect(context.lastSessionId).toBeNull();
    expect(context.buildId).toBe("abc1234");
  });
});
