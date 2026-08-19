import { describe, expect, it } from "vitest";
import { createPointerGate } from "./pointer-gate.js";

function fakeClock(startAt = 0) {
  let current = startAt;
  return { now: () => current, advance: (ms: number) => (current += ms) };
}

describe("createPointerGate (assessment spec: 'Touch and stylus input support')", () => {
  it("accepts finger-touch input when no stylus is present — scenario: finger-only interaction", () => {
    const gate = createPointerGate();
    expect(gate.shouldAccept({ pointerId: 1, pointerType: "touch" })).toBe(true);
  });

  it("always accepts pen input itself", () => {
    const gate = createPointerGate();
    expect(gate.shouldAccept({ pointerId: 1, pointerType: "pen" })).toBe(true);
  });

  it("scenario: stylus input with resting palm — rejects a touch while a pen is actively down", () => {
    const gate = createPointerGate();
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    expect(gate.shouldAccept({ pointerId: 2, pointerType: "touch" })).toBe(false);
  });

  it("rejects a palm touch for a short grace window after the pen lifts", () => {
    const clock = fakeClock();
    const gate = createPointerGate({ now: clock.now, graceMs: 500 });
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.onPointerUp({ pointerId: 1, pointerType: "pen" });
    clock.advance(200);
    expect(gate.shouldAccept({ pointerId: 2, pointerType: "touch" })).toBe(false);
  });

  it("accepts touch again once the grace window has fully elapsed", () => {
    const clock = fakeClock();
    const gate = createPointerGate({ now: clock.now, graceMs: 500 });
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.onPointerUp({ pointerId: 1, pointerType: "pen" });
    clock.advance(600);
    expect(gate.shouldAccept({ pointerId: 2, pointerType: "touch" })).toBe(true);
  });

  it("pointercancel clears pen-active state the same as pointerup", () => {
    const clock = fakeClock();
    const gate = createPointerGate({ now: clock.now, graceMs: 500 });
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.onPointerCancel({ pointerId: 1, pointerType: "pen" });
    clock.advance(600);
    expect(gate.shouldAccept({ pointerId: 2, pointerType: "touch" })).toBe(true);
  });

  it("tracks multiple concurrent pen pointers independently — only clearing all of them re-admits touch", () => {
    const gate = createPointerGate();
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.onPointerDown({ pointerId: 2, pointerType: "pen" });
    gate.onPointerUp({ pointerId: 1, pointerType: "pen" });
    expect(gate.shouldAccept({ pointerId: 3, pointerType: "touch" })).toBe(false); // pointer 2 still active
  });

  it("mouse input is always accepted regardless of pen state", () => {
    const gate = createPointerGate();
    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    expect(gate.shouldAccept({ pointerId: 2, pointerType: "mouse" })).toBe(true);
  });

  it("subscribe reports a rejected decision with penActive: true (diagnostics observability)", () => {
    const gate = createPointerGate();
    const records: unknown[] = [];
    gate.subscribe((record) => records.push(record));

    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.shouldAccept({ pointerId: 2, pointerType: "touch" });

    expect(records).toContainEqual(
      expect.objectContaining({ phase: "decide", pointerType: "touch", accepted: false, penActive: true }),
    );
  });

  it("subscribe's unsubscribe function stops further notifications", () => {
    const gate = createPointerGate();
    const records: unknown[] = [];
    const unsubscribe = gate.subscribe((record) => records.push(record));
    unsubscribe();

    gate.onPointerDown({ pointerId: 1, pointerType: "pen" });
    gate.shouldAccept({ pointerId: 2, pointerType: "touch" });

    expect(records).toEqual([]);
  });

  it("a throwing listener does not break shouldAccept's own return value", () => {
    const gate = createPointerGate();
    gate.subscribe(() => {
      throw new Error("diagnostics bug");
    });

    expect(() => gate.shouldAccept({ pointerId: 1, pointerType: "touch" })).not.toThrow();
    expect(gate.shouldAccept({ pointerId: 1, pointerType: "touch" })).toBe(true);
  });
});
