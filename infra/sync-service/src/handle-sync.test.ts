import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { exportToJsonl } from "@shizi/learner-state";
import type { ArmAssignment } from "@shizi/adaptivity";
import { openEventStore, type EventStore } from "./db.js";
import { handleAssignmentsSync, handleEventsSync } from "./handle-sync.js";

const TOKEN = "test-shared-token";

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
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
