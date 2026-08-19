import { describe, expect, it } from "vitest";
import type { PointerDecisionRecord } from "../../input/pointer-gate.js";
import { summarizeDecisions } from "./pointer.js";

function record(overrides: Partial<PointerDecisionRecord>): PointerDecisionRecord {
  return { at: 0, phase: "decide", pointerType: "touch", pointerId: 1, penActive: false, ...overrides };
}

describe("summarizeDecisions", () => {
  it("counts pen events (one per physical contact — 'down' phase only, not every gate query), accepted touches, and rejected-while-pen-active touches", () => {
    const records: PointerDecisionRecord[] = [
      record({ phase: "down", pointerType: "pen" }),
      record({ phase: "decide", pointerType: "touch", accepted: false, penActive: true }),
      record({ phase: "decide", pointerType: "touch", accepted: true, penActive: false }),
      record({ phase: "up", pointerType: "pen" }),
    ];

    expect(summarizeDecisions(records)).toEqual({
      penEvents: 1,
      touchAccepted: 1,
      touchRejectedWhilePenActive: 1,
    });
  });

  it("does not double-count a single pen contact's 'decide' emissions (a real tap emits decide on both down and up — see use-tap.ts)", () => {
    const records: PointerDecisionRecord[] = [
      record({ phase: "down", pointerType: "pen" }),
      record({ phase: "decide", pointerType: "pen", accepted: true }),
      record({ phase: "decide", pointerType: "pen", accepted: true }),
      record({ phase: "up", pointerType: "pen" }),
    ];
    expect(summarizeDecisions(records).penEvents).toBe(1);
  });

  it("returns all zeros for an empty log", () => {
    expect(summarizeDecisions([])).toEqual({ penEvents: 0, touchAccepted: 0, touchRejectedWhilePenActive: 0 });
  });

  it("does not count a rejected touch that wasn't due to pen activity", () => {
    const records: PointerDecisionRecord[] = [
      record({ phase: "decide", pointerType: "touch", accepted: false, penActive: false }),
    ];
    expect(summarizeDecisions(records).touchRejectedWhilePenActive).toBe(0);
  });
});
