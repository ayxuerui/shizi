import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { __resetPointerGateForTests } from "../input/pointer-gate.js";
import { PenPalmProbe } from "./PenPalmProbe.js";

/** Same jsdom-has-no-PointerEvent workaround as BoutScreen.test.tsx's `tap` helper. */
function pointerEvent(type: string, pointerId: number, pointerType: string): Event {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId, pointerType, clientX: 10, clientY: 10 });
  return event;
}

describe("PenPalmProbe (task 10.0 item (c): observes the real app-wide pointerGate's decisions)", () => {
  beforeEach(() => __resetPointerGateForTests());
  afterEach(() => __resetPointerGateForTests());

  it("starts with all-zero counts", () => {
    render(<PenPalmProbe />);
    expect(screen.getByText(/pen events: 0/)).toBeInTheDocument();
    expect(screen.getByText(/touch accepted: 0/)).toBeInTheDocument();
    expect(screen.getByText(/touch rejected \(palm\): 0/)).toBeInTheDocument();
  });

  it("counts a pen-down followed by a rejected palm touch", () => {
    render(<PenPalmProbe />);
    const pad = screen.getByRole("img", { name: "pen and palm test surface" });

    act(() => {
      pad.dispatchEvent(pointerEvent("pointerdown", 1, "pen"));
      pad.dispatchEvent(pointerEvent("pointerdown", 2, "touch"));
    });

    expect(screen.getByText(/pen events: 1/)).toBeInTheDocument();
    expect(screen.getByText(/touch rejected \(palm\): 1/)).toBeInTheDocument();
  });

  it("counts an accepted touch once no pen is active", () => {
    render(<PenPalmProbe />);
    const pad = screen.getByRole("img", { name: "pen and palm test surface" });

    act(() => {
      pad.dispatchEvent(pointerEvent("pointerdown", 2, "touch"));
    });

    expect(screen.getByText(/touch accepted: 1/)).toBeInTheDocument();
  });
});
