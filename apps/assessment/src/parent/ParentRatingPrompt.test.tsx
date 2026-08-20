import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { COPY } from "../copy.js";
import { ParentRatingPrompt } from "./ParentRatingPrompt.js";

/** Matches BoutScreen.test.tsx's tap helper — jsdom has no PointerEvent
 * constructor, and a raw dispatchEvent needs an explicit act() wrap. */
function tap(element: HTMLElement): void {
  act(() => {
    const down = new Event("pointerdown", { bubbles: true });
    const up = new Event("pointerup", { bubbles: true });
    Object.assign(down, { pointerId: 1, pointerType: "touch" });
    Object.assign(up, { pointerId: 1, pointerType: "touch" });
    element.dispatchEvent(down);
    element.dispatchEvent(up);
  });
}

describe("ParentRatingPrompt (task 7.4 / adaptivity-instrumentation spec: 'Parent one-tap session rating')", () => {
  it("reports the tapped rating upward — purely presentational, no persistence of its own", () => {
    const onRate = vi.fn();
    render(<ParentRatingPrompt onRate={onRate} onSkip={vi.fn()} />);

    tap(screen.getByRole("button", { name: COPY.parentRating.loved.label }));

    expect(onRate).toHaveBeenCalledExactlyOnceWith("loved");
  });

  it("reports each of the three rating values correctly", () => {
    const onRate = vi.fn();
    render(<ParentRatingPrompt onRate={onRate} onSkip={vi.fn()} />);

    tap(screen.getByRole("button", { name: COPY.parentRating.fine.label }));
    tap(screen.getByRole("button", { name: COPY.parentRating.checkedOut.label }));

    expect(onRate).toHaveBeenNthCalledWith(1, "fine");
    expect(onRate).toHaveBeenNthCalledWith(2, "checked-out");
  });

  it("calls onSkip, not onRate, when Skip is tapped", () => {
    const onRate = vi.fn();
    const onSkip = vi.fn();
    render(<ParentRatingPrompt onRate={onRate} onSkip={onSkip} />);

    tap(screen.getByRole("button", { name: COPY.parentRating.skip }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onRate).not.toHaveBeenCalled();
  });

  it("renders an emoji glyph as visible content, while the accessible name stays the Chinese label (parent-rating-emoji-labels)", () => {
    render(<ParentRatingPrompt onRate={vi.fn()} onSkip={vi.fn()} />);

    const loved = screen.getByRole("button", { name: COPY.parentRating.loved.label });
    const fine = screen.getByRole("button", { name: COPY.parentRating.fine.label });
    const checkedOut = screen.getByRole("button", { name: COPY.parentRating.checkedOut.label });

    expect(loved).toHaveTextContent(COPY.parentRating.loved.glyph);
    expect(fine).toHaveTextContent(COPY.parentRating.fine.glyph);
    expect(checkedOut).toHaveTextContent(COPY.parentRating.checkedOut.glyph);

    // The Chinese label itself must NOT be the visible text anymore —
    // only the emoji is, confirming this isn't just an additive change.
    expect(loved).not.toHaveTextContent(COPY.parentRating.loved.label);
  });
});
