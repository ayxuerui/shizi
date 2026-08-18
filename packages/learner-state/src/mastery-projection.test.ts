import { describe, expect, it } from "vitest";
import { computeMasteryStates, DEFAULT_MASTERY_CONFIG } from "./mastery-projection.js";
import type { LearnerEvent } from "./types.js";

let counter = 0;
function event(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    timestamp: `2026-08-17T10:0${counter}:00.000Z`,
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
    outcome: "correct",
    latencyMs: 800,
    positionInSession: counter,
    priorExposureCount: counter - 1,
    daysSinceLastExposure: counter === 1 ? null : 0,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

const FAST = DEFAULT_MASTERY_CONFIG.guessDetectionThresholdMs - 500;
const SLOW = DEFAULT_MASTERY_CONFIG.guessDetectionThresholdMs + 500;

describe("computeMasteryStates (learner-state spec: 'Known-set and mastery projection')", () => {
  it("has no entry for a character with zero events (unseen — not represented, per design: unseen is the absence of a projection entry)", () => {
    const states = computeMasteryStates([]);
    expect(states.has("山")).toBe(false);
  });

  it("starts a character in 'probing' after just one response", () => {
    const states = computeMasteryStates([event({ latencyMs: FAST })]);
    expect(states.get("山")).toBe("probing");
  });

  it("scenario: two fast correct responses promote to known", () => {
    const states = computeMasteryStates([
      event({ latencyMs: FAST }),
      event({ latencyMs: FAST }),
    ]);
    expect(states.get("山")).toBe("known");
  });

  it("scenario: a single miss demotes a known character", () => {
    const states = computeMasteryStates([
      event({ latencyMs: FAST }),
      event({ latencyMs: FAST }), // now known
      event({ outcome: "incorrect", latencyMs: FAST }),
    ]);
    expect(states.get("山")).toBe("shaky");
  });

  it("scenario: slow correct response does not count toward known", () => {
    const states = computeMasteryStates([
      event({ latencyMs: FAST }),
      event({ latencyMs: SLOW }), // breaks the streak — still not known
    ]);
    expect(states.get("山")).toBe("probing");
  });

  it("a slow correct response also demotes an already-known character to shaky", () => {
    const states = computeMasteryStates([
      event({ latencyMs: FAST }),
      event({ latencyMs: FAST }), // known
      event({ latencyMs: SLOW }), // slow correct, not a miss — still demotes
    ]);
    expect(states.get("山")).toBe("shaky");
  });

  it("a shaky character can be re-promoted to known by two more fast-correct responses", () => {
    const states = computeMasteryStates([
      event({ latencyMs: FAST }),
      event({ latencyMs: FAST }), // known
      event({ outcome: "incorrect", latencyMs: FAST }), // shaky
      event({ latencyMs: FAST }),
      event({ latencyMs: FAST }), // known again
    ]);
    expect(states.get("山")).toBe("known");
  });

  it("processes events out of insertion order by timestamp, not array order", () => {
    const early = event({ id: "early", timestamp: "2026-08-17T09:00:00.000Z", latencyMs: FAST });
    const late = event({ id: "late", timestamp: "2026-08-17T11:00:00.000Z", latencyMs: FAST });
    // Passed in reverse chronological order — projection should still
    // process early-then-late, not array-order.
    const states = computeMasteryStates([late, early]);
    expect(states.get("山")).toBe("known");
  });

  it("tracks multiple characters independently", () => {
    const states = computeMasteryStates([
      event({ character: "山", latencyMs: FAST }),
      event({ character: "山", latencyMs: FAST }),
      event({ character: "水", outcome: "incorrect", latencyMs: FAST }),
    ]);
    expect(states.get("山")).toBe("known");
    expect(states.get("水")).toBe("probing");
  });

  it("guess-detection threshold is configurable, not hard-coded (design.md: tunable per-learner)", () => {
    const events = [event({ latencyMs: 2500 }), event({ latencyMs: 2500 })];
    expect(computeMasteryStates(events).get("山")).toBe("probing"); // default 2000ms threshold
    expect(
      computeMasteryStates(events, { guessDetectionThresholdMs: 3000 }).get("山"),
    ).toBe("known"); // looser threshold now qualifies
  });
});
