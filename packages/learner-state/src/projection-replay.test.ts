import { describe, expect, it } from "vitest";
import { computeMasteryStates } from "./mastery-projection.js";
import { computeKnownSet } from "./known-set-projection.js";
import { exportToJsonl, parseJsonl } from "./export.js";
import type { LearnerEvent } from "./types.js";

/**
 * Task 4.7: "given a fixed event log, projections are deterministic and
 * reproducible after logic changes." The concrete, testable version of
 * "after logic changes" is: the projection is a pure function of its
 * input — no hidden state, no wall-clock dependency, no reliance on
 * insertion order — so re-running it (whether today, or after a future
 * refactor of this same function) against the same frozen event log
 * always yields the same result. This is the property design.md's
 * "Projection recomputed after model change" scenario depends on.
 */
const FIXED_LOG: readonly LearnerEvent[] = Object.freeze([
  {
    id: "evt-1",
    timestamp: "2026-08-17T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
    outcome: "correct" as const,
    latencyMs: 900,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
  },
  {
    id: "evt-2",
    timestamp: "2026-08-17T09:01:00.000Z",
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
    outcome: "correct" as const,
    latencyMs: 700,
    positionInSession: 1,
    priorExposureCount: 1,
    daysSinceLastExposure: 0,
    timeOfDay: 9,
    adultPresent: true,
  },
  {
    id: "evt-3",
    timestamp: "2026-08-18T09:00:00.000Z",
    sessionId: "session-2",
    character: "水",
    modality: "hear-tap",
    outcome: "incorrect" as const,
    latencyMs: 1200,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 10,
    adultPresent: false,
  },
]);

describe("projection replay determinism (task 4.7)", () => {
  it("computeMasteryStates is pure — repeated calls on the same frozen input produce identical output", () => {
    const first = computeMasteryStates(FIXED_LOG);
    const second = computeMasteryStates(FIXED_LOG);
    expect(second).toEqual(first);
  });

  it("computeKnownSet is pure — repeated calls on the same mastery states produce identical output", () => {
    const states = computeMasteryStates(FIXED_LOG);
    expect(computeKnownSet(states)).toEqual(computeKnownSet(states));
  });

  it("full pipeline is reproducible end to end: fixed log -> mastery -> known-set", () => {
    const states = computeMasteryStates(FIXED_LOG);
    const knownSet = computeKnownSet(states);
    expect(states.get("山")).toBe("known");
    expect(states.get("水")).toBe("probing");
    expect(knownSet).toEqual(new Set(["山"]));
  });

  it("surviving a full export -> parse round trip reproduces the identical projection (simulates 'recovered from the durable JSONL export')", () => {
    const exported = exportToJsonl(FIXED_LOG);
    const reloaded = parseJsonl(exported);
    expect(computeMasteryStates(reloaded)).toEqual(computeMasteryStates(FIXED_LOG));
  });

  it("input array order does not affect the result — the log is not assumed pre-sorted", () => {
    const shuffled = [FIXED_LOG[2]!, FIXED_LOG[0]!, FIXED_LOG[1]!];
    expect(computeMasteryStates(shuffled)).toEqual(computeMasteryStates(FIXED_LOG));
  });
});
