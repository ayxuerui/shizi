import { describe, expect, it } from "vitest";
import { assembleCandidatePool, PHASE_A_SEQUENCE } from "@shizi/character-data";
import type { LearnerEvent } from "@shizi/learner-state";
import {
  computeDueForMemory,
  decideActivity,
  deriveRecentlyIntroduced,
  DEFAULT_ACTIVITY_SELECTOR_CONFIG,
} from "./activity-selector.js";

const pool = assembleCandidatePool();

let counter = 0;
function event(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    timestamp: "2026-08-20T10:00:00.000Z",
    sessionId: "s0",
    character: "山",
    module: "assess", activity: "hear-tap",
    outcome: "correct",
    latencyMs: 500,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

/** Two fast-correct hear-tap events promote a character to `known`. */
function knownEvents(character: string, timestamp: string): LearnerEvent[] {
  return [
    event({ character, timestamp, latencyMs: 500 }),
    event({ character, timestamp, latencyMs: 500 }),
  ];
}

describe("decideActivity", () => {
  it("a brand-new learner with no events starts with 'learn' (Phase A is entirely unseen)", () => {
    const decision = decideActivity({ pool, events: [], today: "2026-08-23", lastMemoryBoutDate: null });
    expect(decision).toEqual({ type: "learn", characters: PHASE_A_SEQUENCE.slice(0, 6) });
  });

  it("once the active batch's characters have all been exposed but aren't yet known, moves to 'assess' scoped to the active batch", () => {
    const events: LearnerEvent[] = PHASE_A_SEQUENCE.slice(0, 6).map((character) =>
      event({ character, activity: "listen", timestamp: "2026-08-23T09:00:00.000Z" }),
    );
    const decision = decideActivity({ pool, events, today: "2026-08-23", lastMemoryBoutDate: null });
    expect(decision).toEqual({ type: "assess", characters: PHASE_A_SEQUENCE.slice(0, 6) });
  });

  it("assess decision never carries a known/shaky character, even when earlier phase-A characters are already known", () => {
    // PHASE_A_SEQUENCE[0..2) already known — composeBatch skips them and
    // fills the active batch from the next not-yet-known phase-A slots
    // instead of ever re-including a known member.
    const knownCharacterEvents = PHASE_A_SEQUENCE.slice(0, 2).flatMap((character) =>
      knownEvents(character, "2026-08-20T09:00:00.000Z"),
    );
    const exposedCharacterEvents: LearnerEvent[] = PHASE_A_SEQUENCE.slice(2, 8).map((character) =>
      event({ character, activity: "listen", timestamp: "2026-08-23T09:00:00.000Z" }),
    );
    const decision = decideActivity({
      pool,
      events: [...knownCharacterEvents, ...exposedCharacterEvents],
      today: "2026-08-23",
      lastMemoryBoutDate: "2026-08-23",
    });
    expect(decision).toEqual({ type: "assess", characters: PHASE_A_SEQUENCE.slice(2, 8) });
    if (decision.type === "assess") {
      for (const known of PHASE_A_SEQUENCE.slice(0, 2)) expect(decision.characters).not.toContain(known);
    }
  });

  it("is a deterministic projection — replaying the same event history twice yields identical decisions", () => {
    const events: LearnerEvent[] = PHASE_A_SEQUENCE.slice(0, 6).map((character) =>
      event({ character, activity: "listen", timestamp: "2026-08-23T09:00:00.000Z" }),
    );
    const input = { pool, events, today: "2026-08-23", lastMemoryBoutDate: "2026-08-23" };
    expect(decideActivity(input)).toEqual(decideActivity(input));
  });

  it("once the whole active batch is known, moves on to teaching the next batch", () => {
    const events: LearnerEvent[] = PHASE_A_SEQUENCE.slice(0, 6).flatMap((character) =>
      knownEvents(character, "2026-08-23T09:00:00.000Z"),
    );
    const decision = decideActivity({ pool, events, today: "2026-08-23", lastMemoryBoutDate: "2026-08-23" });
    // Batch 2 (PHASE_A_SEQUENCE[6..12]) is entirely unseen.
    expect(decision).toEqual({ type: "learn", characters: PHASE_A_SEQUENCE.slice(6, 12) });
  });

  it("runs a memory bout first when something outside the active batch is due, and no memory bout has run today", () => {
    const events: LearnerEvent[] = [
      ...knownEvents(PHASE_A_SEQUENCE[0]!, "2026-08-01T09:00:00.000Z"), // known, stale — due
      ...PHASE_A_SEQUENCE.slice(1, 5).map((character) =>
        event({ character, activity: "listen", timestamp: "2026-08-23T09:00:00.000Z" }),
      ),
    ];
    const decision = decideActivity({ pool, events, today: "2026-08-23", lastMemoryBoutDate: null });
    expect(decision.type).toBe("memory");
    if (decision.type === "memory") {
      expect(decision.characters).toContain(PHASE_A_SEQUENCE[0]);
    }
  });

  it("does not run a second memory bout the same day, even if something is still due", () => {
    const events: LearnerEvent[] = [...knownEvents(PHASE_A_SEQUENCE[0]!, "2026-08-01T09:00:00.000Z")];
    const decision = decideActivity({ pool, events, today: "2026-08-23", lastMemoryBoutDate: "2026-08-23" });
    expect(decision.type).not.toBe("memory");
  });

  it("a character known as of today (not stale) is not sent to memory review", () => {
    const events: LearnerEvent[] = knownEvents(PHASE_A_SEQUENCE[0]!, "2026-08-23T09:00:00.000Z");
    const decision = decideActivity({ pool, events, today: "2026-08-23", lastMemoryBoutDate: null });
    // PHASE_A_SEQUENCE[0] is known and freshly touched (not due); the new
    // active batch (PHASE_A_SEQUENCE[1..7]) is entirely unintroduced.
    expect(decision).toEqual({ type: "learn", characters: PHASE_A_SEQUENCE.slice(1, 7) });
  });
});

describe("deriveRecentlyIntroduced", () => {
  it("orders by first-seen timestamp, oldest first, most recent last", () => {
    const events = [
      event({ character: "水", timestamp: "2026-08-02T00:00:00.000Z" }),
      event({ character: "山", timestamp: "2026-08-01T00:00:00.000Z" }),
      event({ character: "水", timestamp: "2026-08-03T00:00:00.000Z" }), // later event for 水 — first-seen still wins
    ];
    expect(deriveRecentlyIntroduced(events, 5)).toEqual(["山", "水"]);
  });

  it("caps at windowSize, keeping the most recently introduced", () => {
    const events = ["a", "b", "c", "d"].map((character, i) =>
      event({ character, timestamp: `2026-08-0${i + 1}T00:00:00.000Z` }),
    );
    expect(deriveRecentlyIntroduced(events, 2)).toEqual(["c", "d"]);
  });
});

describe("computeDueForMemory", () => {
  it("includes a known character last touched at or beyond the threshold", () => {
    const events = [event({ character: "山", timestamp: "2026-08-20T00:00:00.000Z" })];
    const due = computeDueForMemory(events, new Set(["山"]), [], 1, "2026-08-23");
    expect(due).toEqual(["山"]);
  });

  it("excludes a character touched more recently than the threshold", () => {
    const events = [event({ character: "山", timestamp: "2026-08-23T00:00:00.000Z" })];
    const due = computeDueForMemory(events, new Set(["山"]), [], 1, "2026-08-23");
    expect(due).toEqual([]);
  });

  it("excludes characters in the exclude list even if otherwise due", () => {
    const events = [event({ character: "山", timestamp: "2026-08-01T00:00:00.000Z" })];
    const due = computeDueForMemory(events, new Set(["山"]), ["山"], 1, "2026-08-23");
    expect(due).toEqual([]);
  });

  it("orders stalest-first", () => {
    const events = [
      event({ character: "水", timestamp: "2026-08-10T00:00:00.000Z" }),
      event({ character: "山", timestamp: "2026-08-01T00:00:00.000Z" }),
    ];
    const due = computeDueForMemory(events, new Set(["山", "水"]), [], 1, "2026-08-23");
    expect(due).toEqual(["山", "水"]);
  });

  it("uses DEFAULT_ACTIVITY_SELECTOR_CONFIG's memoryDueAfterDays/maxMemoryItems by default in decideActivity", () => {
    expect(DEFAULT_ACTIVITY_SELECTOR_CONFIG.memoryDueAfterDays).toBe(1);
    expect(DEFAULT_ACTIVITY_SELECTOR_CONFIG.maxMemoryItems).toBe(8);
  });
});
