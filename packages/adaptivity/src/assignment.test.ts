import { describe, expect, it } from "vitest";
import { assignPairToArms, AssignmentLog, findAssignmentForCharacter } from "./assignment.js";
import type { ArmAssignment, MatchedPair } from "./types.js";

const pair: MatchedPair = { characters: ["山", "水"] };

describe("assignPairToArms (adaptivity-instrumentation spec: 'Matched-pair randomization protocol')", () => {
  it("throws if no arms are configured", () => {
    expect(() => assignPairToArms(pair, [])).toThrow();
  });

  it("scenario: assigns both members even with only one arm implemented", () => {
    const [a, b] = assignPairToArms(pair, ["hear-tap"]);
    expect(a).toMatchObject({ character: "山", arm: "hear-tap" });
    expect(b).toMatchObject({ character: "水", arm: "hear-tap" });
  });

  it("both assignments from one pair share the same pairId", () => {
    const [a, b] = assignPairToArms(pair, ["hear-tap"]);
    expect(a.pairId).toBe(b.pairId);
  });

  it("scenario: assignment recorded before outcome is known — assignedAt is populated immediately, not deferred", () => {
    const fixedTime = "2026-08-17T12:00:00.000Z";
    const [a, b] = assignPairToArms(pair, ["hear-tap"], { now: () => fixedTime });
    expect(a.assignedAt).toBe(fixedTime);
    expect(b.assignedAt).toBe(fixedTime);
  });

  it("with multiple arms, uses the injected random function to choose", () => {
    let callCount = 0;
    const random = () => {
      callCount += 1;
      return callCount === 1 ? 0 : 0.99; // first call -> arm[0], second -> arm[last]
    };
    const [a, b] = assignPairToArms(pair, ["hear-tap", "tracing"], { random });
    expect(a.arm).toBe("hear-tap");
    expect(b.arm).toBe("tracing");
  });
});

describe("AssignmentLog", () => {
  it("records both assignments from a pair", () => {
    const log = new AssignmentLog();
    log.recordPair(assignPairToArms(pair, ["hear-tap"]));
    expect(log.size).toBe(2);
  });

  it("returns a defensive copy from getAssignments", () => {
    const log = new AssignmentLog();
    log.recordPair(assignPairToArms(pair, ["hear-tap"]));
    const assignments = log.getAssignments() as ReturnType<AssignmentLog["getAssignments"]>[number][];
    assignments.push({ character: "x", arm: "y", pairId: "z", assignedAt: "now" });
    expect(log.size).toBe(2); // unaffected by external mutation
  });

  it("exposes no update/delete method — append-only, matching learner-state's EventLog pattern", () => {
    const log = new AssignmentLog();
    // @ts-expect-error - deliberately checking these don't exist on the type
    expect(log.update).toBeUndefined();
    // @ts-expect-error - deliberately checking these don't exist on the type
    expect(log.delete).toBeUndefined();
  });
});

describe("findAssignmentForCharacter (add-tracing-modality-arm: 'existing assignment is honored')", () => {
  it("returns undefined when no assignment exists for the character", () => {
    expect(findAssignmentForCharacter([], "山")).toBeUndefined();
  });

  it("finds the assignment matching the character", () => {
    const [a, b] = assignPairToArms(pair, ["hear-tap"]);
    expect(findAssignmentForCharacter([a, b], "水")).toEqual(b);
  });

  it("returns the most recently assigned match if more than one exists", () => {
    const older: ArmAssignment = { character: "山", arm: "expose-listen", pairId: "p1", assignedAt: "2026-08-01T00:00:00.000Z" };
    const newer: ArmAssignment = { character: "山", arm: "expose-trace", pairId: "p2", assignedAt: "2026-08-02T00:00:00.000Z" };
    expect(findAssignmentForCharacter([older, newer], "山")).toEqual(newer);
    expect(findAssignmentForCharacter([newer, older], "山")).toEqual(newer);
  });
});
