import { describe, expect, it } from "vitest";
import { validateSessionRating } from "./validation.js";
import type { SessionRating } from "./types.js";

function validRating(overrides: Partial<SessionRating> = {}): SessionRating {
  return {
    sessionId: "session-1",
    rating: "loved",
    recordedAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("validateSessionRating (adaptivity-instrumentation spec: 'Parent one-tap session rating')", () => {
  it("accepts a fully-populated rating", () => {
    expect(validateSessionRating(validRating())).toEqual({ valid: true, errors: [] });
  });

  it("accepts each of the three allowed rating values", () => {
    for (const rating of ["loved", "fine", "checked-out"] as const) {
      expect(validateSessionRating(validRating({ rating })).valid).toBe(true);
    }
  });

  it("rejects a rating outside the allowed set", () => {
    const result = validateSessionRating({ ...validRating(), rating: "amazing" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("rating must be one of"))).toBe(true);
  });

  it("rejects a missing required field, without writing a partial record", () => {
    const { sessionId: _sessionId, ...missingSessionId } = validRating();
    const result = validateSessionRating(missingSessionId);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing required field: sessionId");
  });

  it("rejects an empty sessionId", () => {
    const result = validateSessionRating(validRating({ sessionId: "" }));
    expect(result.valid).toBe(false);
  });

  it("rejects a non-ISO recordedAt", () => {
    const result = validateSessionRating(validRating({ recordedAt: "not-a-date" }));
    expect(result.valid).toBe(false);
  });

  it("rejects a non-object value", () => {
    expect(validateSessionRating(null).valid).toBe(false);
    expect(validateSessionRating("session-1").valid).toBe(false);
  });
});
