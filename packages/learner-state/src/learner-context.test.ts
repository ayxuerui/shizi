import { describe, expect, it } from "vitest";
import { DEFAULT_MASTERY_CONFIG } from "./mastery-projection.js";
import { deriveLearnerContext, type LearnerContext } from "./learner-context.js";
import type { LearnerEvent } from "./types.js";

let counter = 0;
function event(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    timestamp: `2026-08-17T10:0${counter}:00.000Z`,
    sessionId: "session-1",
    character: "山",
    module: "assess",
    activity: "hear-tap",
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

/** Serializes a context so two calls' facts can be compared wholesale. */
function snapshot(context: LearnerContext) {
  return {
    masteryStates: [...context.masteryStates.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    knownSet: [...context.knownSet].sort(),
    everPresented: [...context.everPresented].sort(),
    lastExposureByUnit: [...context.lastExposureByUnit.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    introductionOrder: context.introductionOrder,
  };
}

describe("deriveLearnerContext (learner-state spec: 'Learner context is the outward contract for other layers')", () => {
  it("scenario: an introduction-only unit reports as presented, with no mastery state derived from that presentation ('Presented but not yet measured')", () => {
    const context = deriveLearnerContext([
      event({ character: "山", module: "learn", activity: "listen", timestamp: "2026-08-17T09:00:00.000Z" }),
      event({ character: "山", module: "learn", activity: "trace", timestamp: "2026-08-17T09:05:00.000Z" }),
    ]);
    expect(context.everPresented.has("山")).toBe(true);
    expect(context.masteryStates.has("山")).toBe(false);
    expect(context.knownSet.has("山")).toBe(false);
  });

  it("a never-seen unit is absent everywhere, distinct from one that is merely presented-but-unmeasured", () => {
    const context = deriveLearnerContext([
      event({ character: "山", module: "learn", activity: "listen", timestamp: "2026-08-17T09:00:00.000Z" }),
    ]);
    expect(context.everPresented.has("水")).toBe(false);
    expect(context.masteryStates.has("水")).toBe(false);
    expect(context.lastExposureByUnit.has("水")).toBe(false);
    expect(context.introductionOrder).toEqual(["山"]);
  });

  it("scenario: a unit with two fast-correct recognition events reports mastered ('Mastery state per unit')", () => {
    const context = deriveLearnerContext([
      event({ character: "山", timestamp: "2026-08-17T09:00:00.000Z", latencyMs: FAST }),
      event({ character: "山", timestamp: "2026-08-17T09:01:00.000Z", latencyMs: FAST }),
    ]);
    expect(context.masteryStates.get("山")).toBe("known");
    expect(context.knownSet.has("山")).toBe(true);
  });

  it("mastery still comes only from recognition activities, even though presentation counts all of them", () => {
    // Same shape as the mastered case, but exposure-activity: presented
    // with recency, yet never measured — the two facts must not conflate.
    const context = deriveLearnerContext([
      event({ character: "山", module: "learn", activity: "listen", timestamp: "2026-08-17T09:00:00.000Z" }),
      event({ character: "山", module: "learn", activity: "listen", timestamp: "2026-08-17T09:01:00.000Z" }),
    ]);
    expect(context.everPresented.has("山")).toBe(true);
    expect(context.lastExposureByUnit.get("山")).toBe("2026-08-17T09:01:00.000Z");
    expect(context.masteryStates.has("山")).toBe(false);
  });

  it("scenario: introduction order follows first-ever exposure across all modalities, oldest first ('Introduction order')", () => {
    // 水's first-ever appearance (exposure) predates 山's first
    // recognition event — first contact in ANY activity is what counts.
    const context = deriveLearnerContext([
      event({ character: "山", timestamp: "2026-08-18T09:00:00.000Z" }),
      event({ character: "水", module: "learn", activity: "listen", timestamp: "2026-08-17T09:00:00.000Z" }),
      event({ character: "火", timestamp: "2026-08-19T09:00:00.000Z" }),
    ]);
    expect(context.introductionOrder).toEqual(["水", "山", "火"]);
  });

  it("scenario: last-exposure follows the most recent event of any activity ('Exposure recency')", () => {
    const context = deriveLearnerContext([
      event({ character: "山", module: "learn", activity: "trace", timestamp: "2026-08-17T09:00:00.000Z" }),
      event({ character: "山", timestamp: "2026-08-20T12:00:00.000Z", outcome: "incorrect" }),
      event({ character: "水", timestamp: "2026-08-18T09:00:00.000Z" }),
    ]);
    expect(context.lastExposureByUnit.get("山")).toBe("2026-08-20T12:00:00.000Z");
    expect(context.lastExposureByUnit.get("水")).toBe("2026-08-18T09:00:00.000Z");
  });

  it("scenario: two calls against the same log return identical facts ('Two consumers see the same progress')", () => {
    const events = [
      event({ character: "水", module: "learn", activity: "listen", timestamp: "2026-08-16T09:00:00.000Z" }),
      event({ character: "山", timestamp: "2026-08-17T10:00:00.000Z", latencyMs: FAST }),
      event({ character: "山", timestamp: "2026-08-17T11:00:00.000Z", latencyMs: FAST }),
      event({ character: "火", timestamp: "2026-08-19T09:00:00.000Z", latencyMs: FAST }),
    ];
    expect(snapshot(deriveLearnerContext(events))).toEqual(snapshot(deriveLearnerContext(events)));
  });

  it("the projection is order-insensitive: a shuffled log yields the same facts as the sorted one", () => {
    const sorted = [
      event({ id: "a", character: "水", module: "learn", activity: "listen", timestamp: "2026-08-16T09:00:00.000Z" }),
      event({ id: "b", character: "山", timestamp: "2026-08-17T10:00:00.000Z", latencyMs: FAST }),
      event({ id: "c", character: "山", timestamp: "2026-08-17T11:00:00.000Z", latencyMs: FAST }),
    ];
    const shuffled: LearnerEvent[] = [sorted[2]!, sorted[0]!, sorted[1]!];
    expect(snapshot(deriveLearnerContext(shuffled))).toEqual(snapshot(deriveLearnerContext(sorted)));
  });

  it("scenario: an empty log yields an empty context ('The context is derived, not stored')", () => {
    const context = deriveLearnerContext([]);
    expect(context.masteryStates.size).toBe(0);
    expect(context.knownSet.size).toBe(0);
    expect(context.everPresented.size).toBe(0);
    expect(context.lastExposureByUnit.size).toBe(0);
    expect(context.introductionOrder).toEqual([]);
  });
});
