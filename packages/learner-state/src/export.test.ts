import { describe, expect, it } from "vitest";
import { exportToJsonl, parseJsonl } from "./export.js";
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

describe("exportToJsonl / parseJsonl (learner-state spec: 'Durable repo-side export')", () => {
  it("round-trips a list of events", () => {
    const events = [event({ id: "evt-1" }), event({ id: "evt-2", character: "水" })];
    const jsonl = exportToJsonl(events);
    expect(parseJsonl(jsonl)).toEqual(events);
  });

  it("produces one line per event", () => {
    const events = [event({ id: "evt-1" }), event({ id: "evt-2" })];
    expect(exportToJsonl(events).trim().split("\n")).toHaveLength(2);
  });

  it("produces an empty string for an empty log", () => {
    expect(exportToJsonl([])).toBe("");
    expect(parseJsonl("")).toEqual([]);
  });
});
