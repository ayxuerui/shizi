import { describe, expect, it } from "vitest";
import { assembleCandidatePool, PHASE_A_SEQUENCE } from "@shizi/character-data";
import type { ArmAssignment } from "@shizi/adaptivity";
import type { SessionDeps } from "./types.js";
import { ExposureSession } from "./session.js";

const pool = assembleCandidatePool();

/** Masks every character except the given ones back to "untagged" (same
 * technique `@shizi/curriculum`'s select.test.ts uses) so phase-b
 * selection has a small, fully controlled candidate set. */
function withUsableCandidates(characters: readonly string[]): typeof pool {
  const modified = new Map(pool);
  for (const [key, entry] of modified) {
    modified.set(
      key,
      characters.includes(key)
        ? { ...entry, concreteness: "concrete", pictographic: false, tagSource: "reviewed" }
        : { ...entry, concreteness: null, pictographic: null, tagSource: null },
    );
  }
  return modified;
}

function makeDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  let idCounter = 0;
  return {
    now: () => "2026-08-23T10:00:00.000Z",
    timeOfDay: () => 10,
    random: () => 0,
    newId: () => `evt-${idCounter++}`,
    ...overrides,
  };
}

describe("ExposureSession — character selection defers to curriculum", () => {
  it("selects the first Phase A character when nothing is known yet", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    const result = session.nextItem();
    expect(result).toEqual({ status: "item", item: { character: PHASE_A_SEQUENCE[0], arm: expect.any(String) } });
  });

  it("does not reimplement ordering — matches @shizi/curriculum's own selectNextCharacter for the same state", () => {
    const priorEvents = PHASE_A_SEQUENCE.slice(0, 3).flatMap((character, i) => [
      { id: `k${i}a`, timestamp: "2026-08-01T00:00:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 0, priorExposureCount: 0, daysSinceLastExposure: null, timeOfDay: 9, adultPresent: true },
      { id: `k${i}b`, timestamp: "2026-08-01T00:01:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 1, priorExposureCount: 1, daysSinceLastExposure: 0, timeOfDay: 9, adultPresent: true },
    ]);
    const session = new ExposureSession({ sessionId: "s1", pool, priorEvents, deps: makeDeps() });
    const result = session.nextItem();
    if (result.status !== "item") throw new Error("expected an item");
    expect(result.item.character).toBe(PHASE_A_SEQUENCE[3]);
  });

  it("never selects the same character twice within one session, even though exposure writes no recognition event", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    const first = session.nextItem();
    if (first.status !== "item") throw new Error("expected an item");
    session.recordCompletion({ character: first.item.character, latencyMs: 1000, adultPresent: true });
    const second = session.nextItem();
    if (second.status !== "item") throw new Error("expected an item");
    expect(second.item.character).not.toBe(first.item.character);
    expect(second.item.character).toBe(PHASE_A_SEQUENCE[1]);
  });

  it("reports none-eligible once curriculum has nothing left (mirrors selectNextCharacter's own result shape)", () => {
    const knownEverything = [...pool.keys()];
    const priorEvents = knownEverything.flatMap((character, i) => [
      { id: `k${i}a`, timestamp: "2026-08-01T00:00:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 0, priorExposureCount: 0, daysSinceLastExposure: null, timeOfDay: 9, adultPresent: true },
      { id: `k${i}b`, timestamp: "2026-08-01T00:01:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 1, priorExposureCount: 1, daysSinceLastExposure: 0, timeOfDay: 9, adultPresent: true },
    ]);
    const session = new ExposureSession({ sessionId: "s1", pool, priorEvents, deps: makeDeps() });
    const result = session.nextItem();
    expect(result.status).toBe("none-eligible");
  });
});

describe("ExposureSession — arm resolution (exposure spec: 'Arm-bound exposure delivery')", () => {
  it("honors an existing assignment rather than creating a new one", () => {
    const priorAssignments: ArmAssignment[] = [
      { character: PHASE_A_SEQUENCE[0]!, arm: "trace", pairId: "p1", assignedAt: "2026-08-01T00:00:00.000Z" },
    ];
    const session = new ExposureSession({ sessionId: "s1", pool, priorAssignments, deps: makeDeps() });
    const result = session.nextItem();
    if (result.status !== "item") throw new Error("expected an item");
    expect(result.item.arm).toBe("trace");
    expect(session.getAssignments()).toHaveLength(0); // nothing new recorded
  });

  it("creates and records an assignment when none exists yet", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    const result = session.nextItem();
    if (result.status !== "item") throw new Error("expected an item");
    expect(session.getAssignments().length).toBeGreaterThan(0);
    expect(session.getAssignments().some((a) => a.character === result.item.character)).toBe(true);
  });

  it("a matched pair's two members can resolve to different arms end-to-end", () => {
    const usablePool = withUsableCandidates(["谢", "写"]); // controlled, mutually matchable candidates
    let callCount = 0;
    const random = () => {
      callCount += 1;
      return callCount === 1 ? 0 : 0.99; // first pick -> arms[0], second -> arms[last]
    };
    const session = new ExposureSession({
      sessionId: "s1",
      pool: usablePool,
      priorEvents: PHASE_A_SEQUENCE.flatMap((character, i) => [
        { id: `k${i}a`, timestamp: "2026-08-01T00:00:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 0, priorExposureCount: 0, daysSinceLastExposure: null, timeOfDay: 9, adultPresent: true },
        { id: `k${i}b`, timestamp: "2026-08-01T00:01:00.000Z", sessionId: "s0", character, module: "assess" as const, activity: "hear-tap" as const, outcome: "correct" as const, latencyMs: 500, positionInSession: 1, priorExposureCount: 1, daysSinceLastExposure: 0, timeOfDay: 9, adultPresent: true },
      ]),
      deps: makeDeps({ random }),
    });
    const first = session.nextItem();
    if (first.status !== "item") throw new Error("expected an item");
    session.recordCompletion({ character: first.item.character, latencyMs: 1000, adultPresent: true });
    const second = session.nextItem();
    if (second.status !== "item") throw new Error("expected an item");

    expect(new Set([first.item.character, second.item.character])).toEqual(new Set(["谢", "写"]));
    expect(session.getAssignments()).toHaveLength(2); // both members of the pair assigned together
  });
});

describe("ExposureSession — completion events (exposure spec: 'Exposure events are non-recognition')", () => {
  it("records a full LearnerEvent with outcome always 'correct' and module/activity set to the delivered arm", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    const item = session.nextItem();
    if (item.status !== "item") throw new Error("expected an item");
    const { event } = session.recordCompletion({ character: item.item.character, latencyMs: 1234, adultPresent: false });
    expect(event.outcome).toBe("correct");
    expect(event.activity).toBe(item.item.arm);
    expect(event.character).toBe(item.item.character);
    expect(event.latencyMs).toBe(1234);
  });

  it("throws if recordCompletion is called with no outstanding item", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    expect(() => session.recordCompletion({ character: "山", latencyMs: 500, adultPresent: true })).toThrow();
  });

  it("throws if recordCompletion's character doesn't match the outstanding item", () => {
    const session = new ExposureSession({ sessionId: "s1", pool, deps: makeDeps() });
    const item = session.nextItem();
    if (item.status !== "item") throw new Error("expected an item");
    const wrongCharacter = item.item.character === PHASE_A_SEQUENCE[1] ? PHASE_A_SEQUENCE[2]! : PHASE_A_SEQUENCE[1]!;
    expect(() => session.recordCompletion({ character: wrongCharacter, latencyMs: 500, adultPresent: true })).toThrow();
  });
});
