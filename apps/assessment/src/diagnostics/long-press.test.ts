import { describe, expect, it, vi } from "vitest";
import { createLongPress } from "./long-press.js";

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let nextId = 1;
  const setTimer = vi.fn((fn: () => void) => {
    const id = nextId++;
    pending.set(id, fn);
    return id;
  });
  const clearTimer = vi.fn((id: number) => {
    pending.delete(id);
  });
  const fire = (id: number): void => {
    const fn = pending.get(id);
    if (fn) fn();
  };
  return { setTimer, clearTimer, fire };
}

describe("createLongPress", () => {
  it("triggers after the hold completes uninterrupted", () => {
    const { setTimer, clearTimer, fire } = fakeTimers();
    const onTrigger = vi.fn();
    const press = createLongPress({ onTrigger, setTimer, clearTimer });

    press.onPointerDown();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 1500);
    fire(1);

    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("does not trigger if pointerup arrives before the hold completes", () => {
    const { setTimer, clearTimer, fire } = fakeTimers();
    const onTrigger = vi.fn();
    const press = createLongPress({ onTrigger, setTimer, clearTimer });

    press.onPointerDown();
    press.onPointerUp();
    fire(1); // the timer was cleared; firing it directly (bypassing the clear) must be a no-op in a real clock, but here we just confirm clearTimer was called

    expect(clearTimer).toHaveBeenCalledWith(1);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("does not trigger if pointercancel arrives before the hold completes", () => {
    const { setTimer, clearTimer } = fakeTimers();
    const onTrigger = vi.fn();
    const press = createLongPress({ onTrigger, setTimer, clearTimer });

    press.onPointerDown();
    press.onPointerCancel();

    expect(clearTimer).toHaveBeenCalledWith(1);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("does not trigger if pointerleave arrives before the hold completes", () => {
    const { setTimer, clearTimer } = fakeTimers();
    const onTrigger = vi.fn();
    const press = createLongPress({ onTrigger, setTimer, clearTimer });

    press.onPointerDown();
    press.onPointerLeave();

    expect(clearTimer).toHaveBeenCalledWith(1);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("does not double-fire across two separate down/hold cycles", () => {
    const { setTimer, clearTimer, fire } = fakeTimers();
    const onTrigger = vi.fn();
    const press = createLongPress({ onTrigger, setTimer, clearTimer });

    press.onPointerDown();
    fire(1);
    press.onPointerUp();
    press.onPointerDown();
    fire(2);

    expect(onTrigger).toHaveBeenCalledTimes(2);
  });

  it("respects a custom holdMs", () => {
    const { setTimer, clearTimer } = fakeTimers();
    const press = createLongPress({ onTrigger: vi.fn(), holdMs: 3000, setTimer, clearTimer });
    press.onPointerDown();
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 3000);
  });
});
