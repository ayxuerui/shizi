import { describe, expect, it } from "vitest";
import { EventLog } from "./event-log.js";
import type { LearnerEvent } from "./types.js";

function event(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-17T10:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    module: "assess",
    activity: "hear-tap",
    outcome: "correct",
    latencyMs: 800,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

describe("EventLog (learner-state spec: 'Event log is append-only and canonical')", () => {
  it("appends a valid event", () => {
    const log = new EventLog();
    const result = log.append(event());
    expect(result).toEqual({ status: "appended" });
    expect(log.size).toBe(1);
  });

  it("rejects a malformed event and does not add it", () => {
    const log = new EventLog();
    const { id: _id, ...malformed } = event();
    const result = log.append(malformed);
    expect(result.status).toBe("rejected");
    expect(log.size).toBe(0);
  });

  describe("idempotent sync (spec: 'Offline durability and idempotent sync')", () => {
    it("treats re-appending the same event id as a no-op, not an error", () => {
      const log = new EventLog();
      log.append(event({ id: "evt-1" }));
      const result = log.append(event({ id: "evt-1" }));
      expect(result).toEqual({ status: "duplicate" });
      expect(log.size).toBe(1); // not 2
    });
  });

  describe("no destructive writes (spec scenario)", () => {
    it("exposes no mutate or delete method at all", () => {
      const log = new EventLog();
      // @ts-expect-error - deliberately checking these don't exist on the type
      expect(log.delete).toBeUndefined();
      // @ts-expect-error - deliberately checking these don't exist on the type
      expect(log.update).toBeUndefined();
    });

    it("returns a defensive copy from getEvents — mutating the result doesn't affect the log", () => {
      const log = new EventLog();
      log.append(event());
      const events = log.getEvents() as LearnerEvent[];
      events.push(event({ id: "evt-2" }));
      expect(log.size).toBe(1);
    });
  });
});
