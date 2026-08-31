import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { exportToJsonl, toJsonl } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";
import { MAX_MESSAGE_LENGTH, type IssueReport } from "@shizi/issue-reports";
import { openEventStore, type EventStore } from "./db.js";
import {
  handleAssignmentsSync,
  handleEventsSync,
  handleIssueReportsSync,
  handleRatingsSync,
} from "./handle-sync.js";

const TOKEN = "test-shared-token";

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


function makeIssueReport(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    id: "report-1",
    kind: "bug",
    message: "The audio did not play for 山.",
    createdAt: "2026-08-29T10:00:00.000Z",
    context: {
      appEnv: "prod",
      buildId: "abc1234",
      userAgent: "Mozilla/5.0 (iPad)",
      standalone: true,
      online: false,
      lastSessionId: null,
      lastActivity: null,
    },
    ...overrides,
  };
}

describe("handleEventsSync (task 9.2, 'assessment' spec: 'Full offline operation' — server side of the sync contract)", () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-handle-sync-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a request with no auth header", () => {
    const result = handleEventsSync({ authHeader: null, bodyText: "" }, { expectedToken: TOKEN, store });
    expect(result.status).toBe(401);
  });

  it("rejects a request with the wrong token", () => {
    const result = handleEventsSync(
      { authHeader: "Bearer wrong", bodyText: "" },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(401);
  });

  it("accepts and inserts a valid NDJSON body — matches the client's exact wire format (learner-state's exportToJsonl)", () => {
    const event = makeEvent();
    const body = exportToJsonl([event]);

    const result = handleEventsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(result).toMatchObject({ status: 200, body: { inserted: 1, duplicates: 0, rejected: 0 } });
    expect(store.getAllEvents()).toEqual([event]);
  });

  it("is idempotent — re-posting the same event counts as a duplicate, not a second insert", () => {
    const event = makeEvent();
    const body = exportToJsonl([event]);
    handleEventsSync({ authHeader: `Bearer ${TOKEN}`, bodyText: body }, { expectedToken: TOKEN, store });

    const second = handleEventsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(second).toMatchObject({ status: 200, body: { inserted: 0, duplicates: 1 } });
    expect(store.getAllEvents()).toHaveLength(1);
  });

  it("rejects malformed NDJSON with a 400, not a 500 or a crash", () => {
    const result = handleEventsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: "not json at all {{{" },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(400);
  });

  it("rejects an individual malformed event (defense in depth) without failing the whole batch", () => {
    const good = makeEvent({ id: "evt-good" });
    const bad = { ...makeEvent({ id: "evt-bad" }), latencyMs: -5 };
    const body = [JSON.stringify(good), JSON.stringify(bad)].join("\n") + "\n";

    const result = handleEventsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(result).toMatchObject({ status: 200, body: { inserted: 1, rejected: 1 } });
    expect(store.getAllEvents().map((e) => e.id)).toEqual(["evt-good"]);
  });

  it("handles an empty body without error", () => {
    const result = handleEventsSync({ authHeader: `Bearer ${TOKEN}`, bodyText: "" }, { expectedToken: TOKEN, store });
    expect(result).toMatchObject({ status: 200, body: { inserted: 0, duplicates: 0, rejected: 0 } });
  });
});

describe("handleAssignmentsSync (task 9.2)", () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-handle-sync-assignments-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects without a valid token", () => {
    const result = handleAssignmentsSync({ authHeader: null, bodyText: "" }, { expectedToken: TOKEN, store });
    expect(result.status).toBe(401);
  });

  it("accepts and inserts a valid assignment", () => {
    const assignment: ArmAssignment = {
      character: "山",
      arm: "hear-tap",
      pairId: "山 水",
      assignedAt: "2026-08-19T09:00:00.000Z",
    };
    const body = `${JSON.stringify(assignment)}\n`;

    const result = handleAssignmentsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(result).toMatchObject({ status: 200, body: { inserted: 1 } });
    expect(store.getAllAssignments()).toEqual([assignment]);
  });

  it("rejects a record missing required assignment fields", () => {
    const body = `${JSON.stringify({ character: "山" })}\n`;
    const result = handleAssignmentsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );
    expect(result).toMatchObject({ status: 200, body: { inserted: 0, rejected: 1 } });
  });
});

describe("handleRatingsSync (task 9.2, adaptivity-instrumentation spec: 'Parent one-tap session rating' — server side)", () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-handle-sync-ratings-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects without a valid token", () => {
    const result = handleRatingsSync({ authHeader: null, bodyText: "" }, { expectedToken: TOKEN, store });
    expect(result.status).toBe(401);
  });

  it("accepts and inserts a valid rating", () => {
    const rating: SessionRating = {
      sessionId: "session-1",
      rating: "loved",
      recordedAt: "2026-08-19T09:00:00.000Z",
    };
    const body = `${JSON.stringify(rating)}\n`;

    const result = handleRatingsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(result).toMatchObject({ status: 200, body: { inserted: 1, duplicates: 0, rejected: 0 } });
    expect(store.getAllRatings()).toEqual([rating]);
  });

  it("is idempotent — re-posting the same sessionId counts as a duplicate, not a second insert", () => {
    const rating: SessionRating = {
      sessionId: "session-1",
      rating: "loved",
      recordedAt: "2026-08-19T09:00:00.000Z",
    };
    const body = `${JSON.stringify(rating)}\n`;
    handleRatingsSync({ authHeader: `Bearer ${TOKEN}`, bodyText: body }, { expectedToken: TOKEN, store });

    const second = handleRatingsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(second).toMatchObject({ status: 200, body: { inserted: 0, duplicates: 1 } });
    expect(store.getAllRatings()).toHaveLength(1);
  });

  it("rejects a rating value outside the allowed set (defense in depth)", () => {
    const body = `${JSON.stringify({ sessionId: "session-1", rating: "amazing", recordedAt: "2026-08-19T09:00:00.000Z" })}\n`;
    const result = handleRatingsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );
    expect(result).toMatchObject({ status: 200, body: { inserted: 0, rejected: 1 } });
  });

  it("rejects malformed NDJSON with a 400, not a 500 or a crash", () => {
    const result = handleRatingsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: "not json at all {{{" },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(400);
  });
});

describe("handleIssueReportsSync (add-issue-reporting, issue-reporting spec: 'The sync endpoint accepts reports under the existing authorization and validation discipline')", () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-handle-sync-reports-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a request with no auth header, storing nothing", () => {
    const result = handleIssueReportsSync(
      { authHeader: null, bodyText: toJsonl([makeIssueReport()]) },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(401);
    expect(store.getAllIssueReports()).toEqual([]);
  });

  it("rejects a request with the wrong token, storing nothing", () => {
    const result = handleIssueReportsSync(
      { authHeader: "Bearer wrong", bodyText: toJsonl([makeIssueReport()]) },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(401);
    expect(store.getAllIssueReports()).toEqual([]);
  });

  it("rejects malformed NDJSON with a 400, not a 500 or a crash", () => {
    const result = handleIssueReportsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: "not json at all {{{" },
      { expectedToken: TOKEN, store },
    );
    expect(result.status).toBe(400);
  });

  it("accepts and inserts a valid two-report batch — the client's exact wire format (learner-state's toJsonl)", () => {
    const reports = [makeIssueReport({ id: "report-1" }), makeIssueReport({ id: "report-2", kind: "feature" })];
    const result = handleIssueReportsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: toJsonl(reports) },
      { expectedToken: TOKEN, store },
    );
    expect(result).toMatchObject({ status: 200, body: { inserted: 2, duplicates: 0, rejected: 0 } });
    expect(store.getAllIssueReports()).toEqual(reports);
  });

  it("is idempotent — re-posting the same batch counts as duplicates, not second inserts", () => {
    const body = toJsonl([makeIssueReport({ id: "report-1" }), makeIssueReport({ id: "report-2" })]);
    handleIssueReportsSync({ authHeader: `Bearer ${TOKEN}`, bodyText: body }, { expectedToken: TOKEN, store });

    const second = handleIssueReportsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );
    expect(second).toMatchObject({ status: 200, body: { inserted: 0, duplicates: 2, rejected: 0 } });
    expect(store.getAllIssueReports()).toHaveLength(2);
  });

  it("rejects and counts malformed reports (defense in depth) without failing the valid ones in the same batch", () => {
    const good = makeIssueReport({ id: "report-good" });
    const unknownKind = { ...makeIssueReport({ id: "report-kind" }), kind: "question" };
    const tooLong = makeIssueReport({ id: "report-long", message: "x".repeat(MAX_MESSAGE_LENGTH + 1) });
    const body = [good, unknownKind, tooLong].map((r) => JSON.stringify(r)).join("\n") + "\n";

    const result = handleIssueReportsSync(
      { authHeader: `Bearer ${TOKEN}`, bodyText: body },
      { expectedToken: TOKEN, store },
    );

    expect(result).toMatchObject({ status: 200, body: { inserted: 1, duplicates: 0, rejected: 2 } });
    const errors = (result.body as { errors?: string[] }).errors ?? [];
    expect(errors.some((e) => e.includes("kind must be one of"))).toBe(true);
    expect(errors.some((e) => e.includes(`message must be at most ${MAX_MESSAGE_LENGTH}`))).toBe(true);
    expect(store.getAllIssueReports().map((r) => r.id)).toEqual(["report-good"]);
  });
});
