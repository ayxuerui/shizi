import { describe, expect, it } from "vitest";
import { validateEvent } from "./validation.js";
import type { LearnerEvent } from "./types.js";

function validEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
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

describe("validateEvent (learner-state spec: 'Event schema captures interaction context')", () => {
  it("accepts a fully-populated event", () => {
    expect(validateEvent(validEvent())).toEqual({ valid: true, errors: [] });
  });

  it("rejects an event missing a required field, without writing a partial record", () => {
    const { id: _id, ...missingId } = validEvent();
    const result = validateEvent(missingId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required field: id");
  });

  it("accepts daysSinceLastExposure: null (first-ever exposure) — required means present, not truthy", () => {
    expect(validateEvent(validEvent({ daysSinceLastExposure: null })).valid).toBe(true);
  });

  it("accepts latencyMs: 0, positionInSession: 0, priorExposureCount: 0, adultPresent: false — all legitimate falsy-but-present values", () => {
    const result = validateEvent(
      validEvent({ latencyMs: 0, positionInSession: 0, priorExposureCount: 0, adultPresent: false }),
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects an invalid outcome value", () => {
    const result = validateEvent(validEvent({ outcome: "maybe" as never }));
    expect(result.valid).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(validateEvent("not an object").valid).toBe(false);
    expect(validateEvent(null).valid).toBe(false);
    expect(validateEvent(undefined).valid).toBe(false);
  });

  it("rejects an unparseable timestamp", () => {
    expect(validateEvent(validEvent({ timestamp: "not a date" })).valid).toBe(false);
  });

  it("rejects timeOfDay outside 0-23", () => {
    expect(validateEvent(validEvent({ timeOfDay: 24 })).valid).toBe(false);
    expect(validateEvent(validEvent({ timeOfDay: -1 })).valid).toBe(false);
  });

  it("rejects an invalid module value", () => {
    expect(validateEvent(validEvent({ module: "testing" as never })).valid).toBe(false);
  });

  it("rejects a pre-migration event still carrying the retired modality field (rename-event-modality-to-activity)", () => {
    const legacy = { ...validEvent(), modality: "hear-tap" } as unknown as Record<string, unknown>;
    const result = validateEvent(legacy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("retired field"))).toBe(true);
  });
});
