import { describe, expect, it } from "vitest";
import { assembleCandidatePool } from "@shizi/character-data";
import { validateEvent } from "@shizi/learner-state";
import type { MemorySessionDeps } from "./memory-session.js";
import { MemorySession } from "./memory-session.js";

const pool = assembleCandidatePool();

function makeDeps(overrides: Partial<MemorySessionDeps> = {}): MemorySessionDeps {
  let idCounter = 0;
  return {
    now: () => "2026-08-23T10:00:00.000Z",
    timeOfDay: () => 10,
    random: () => 0,
    newId: () => `evt-${idCounter++}`,
    ...overrides,
  };
}

describe("MemorySession", () => {
  it("presents the due characters in the given order", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山", "水"], deps: makeDeps() });
    const first = session.nextProbe();
    if (first.status !== "probe") throw new Error("expected a probe");
    expect(first.probe.character).toBe("山");
    expect(first.probe.options).toContain("山");
    session.recordResponse({ character: "山", outcome: "correct", latencyMs: 500, adultPresent: true });

    const second = session.nextProbe();
    if (second.status !== "probe") throw new Error("expected a probe");
    expect(second.probe.character).toBe("水");
  });

  it("completes once every due character has been probed", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山"], deps: makeDeps() });
    const first = session.nextProbe();
    if (first.status !== "probe") throw new Error("expected a probe");
    session.recordResponse({ character: "山", outcome: "correct", latencyMs: 500, adultPresent: true });
    expect(session.nextProbe()).toEqual({ status: "session-complete" });
  });

  it("completes immediately when given an empty due list", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: [], deps: makeDeps() });
    expect(session.nextProbe()).toEqual({ status: "session-complete" });
  });

  it("records a real recognition (hear-tap) event, so a miss demotes the character through the normal mastery projection", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山"], deps: makeDeps() });
    session.nextProbe();
    const { event } = session.recordResponse({ character: "山", outcome: "incorrect", latencyMs: 900, adultPresent: true });
    expect(event.activity).toBe("hear-tap");
    expect(event.outcome).toBe("incorrect");
    expect(validateEvent(event).valid).toBe(true);
  });

  it("throws if recordResponse is called with no outstanding probe", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山"], deps: makeDeps() });
    expect(() => session.recordResponse({ character: "山", outcome: "correct", latencyMs: 500, adultPresent: true })).toThrow();
  });

  it("throws if recordResponse's character doesn't match the outstanding probe", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山"], deps: makeDeps() });
    session.nextProbe();
    expect(() => session.recordResponse({ character: "水", outcome: "correct", latencyMs: 500, adultPresent: true })).toThrow();
  });

  it("every option set includes the target character", () => {
    const session = new MemorySession({ sessionId: "s1", pool, dueCharacters: ["山", "水", "火"], deps: makeDeps() });
    for (const expected of ["山", "水", "火"]) {
      const next = session.nextProbe();
      if (next.status !== "probe") throw new Error("expected a probe");
      expect(next.probe.options).toContain(expected);
      session.recordResponse({ character: expected, outcome: "correct", latencyMs: 500, adultPresent: true });
    }
  });
});
