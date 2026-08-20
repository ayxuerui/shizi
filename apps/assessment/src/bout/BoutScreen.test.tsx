import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_ASSESSMENT_SESSION_CONFIG } from "@shizi/assessment-engine";
import { __resetDBForTests } from "../offline/db.js";
import { listPendingRatings } from "../offline/event-queue.js";
import { COPY } from "../copy.js";
import { BoutScreen } from "./BoutScreen.js";

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/**
 * Simulates a real tap through TapTarget's pointer-event-based
 * activation (not fireEvent.click, which the component never listens
 * for) — matching input/use-tap.ts's actual commit path. jsdom has no
 * `PointerEvent` constructor, so this builds a plain `Event` and assigns
 * the `pointerId`/`pointerType` properties React's handlers read — React
 * attaches listeners by event-type string, not an `instanceof` check, so
 * this is dispatched and handled identically to a real one.
 *
 * Wrapped in `act()`: a raw `dispatchEvent` (unlike RTL's own
 * `fireEvent`) isn't automatically `act()`-wrapped, so without this the
 * resulting state update isn't guaranteed to have committed before the
 * next line of the test runs — this was a real, confirmed source of
 * flakiness while writing this test (a second tap could land before the
 * first dispatch's state update had actually committed).
 */
function tap(element: HTMLElement): void {
  act(() => {
    const pointerId = 1;
    const down = new Event("pointerdown", { bubbles: true });
    const up = new Event("pointerup", { bubbles: true });
    Object.assign(down, { pointerId, pointerType: "touch" });
    Object.assign(up, { pointerId, pointerType: "touch" });
    element.dispatchEvent(down);
    element.dispatchEvent(up);
  });
}

/** No digit and no "%" anywhere in the rendered DOM — the structural
 * check behind "no visible scoring or failure state". */
function assertNoScoreLikeText(): void {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\d/);
  expect(text).not.toContain("%");
}

describe("BoutScreen (assessment spec: 'No visible scoring or failure state', 'Narrative framing', 'Bounded session length')", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("walks a full 2-item bout with no score ever shown, and reaches the closing beat", async () => {
    render(<BoutScreen config={{ ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 2 }} />);

    // Item 1: tap whichever option is first — what matters for this test
    // is that BOTH a correct and an incorrect outcome (whichever this
    // happens to be) advance the bout identically and never show a score,
    // not which specific option that turns out to be.
    const options1 = await screen.findAllByRole("button", { name: /^[一-鿿]$/ });
    assertNoScoreLikeText();
    tap(options1[0]!);

    // Item 2: wait for FRESH, re-enabled options — right after the tap,
    // item 1's (still-present but disabled) buttons would otherwise
    // satisfy a plain query immediately, before the resolve delay
    // elapses and item 2 actually renders.
    await waitFor(
      () => {
        const buttons = screen.getAllByRole("button", { name: /^[一-鿿]$/ });
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons[0]).toBeEnabled();
      },
      { timeout: 3000 },
    );
    const options2 = screen.getAllByRole("button", { name: /^[一-鿿]$/ });
    assertNoScoreLikeText();
    tap(options2[0]!);

    // maxItems: 2 reached — closing beat.
    const closingHeading = await screen.findByText(/悟空到家了/, {}, { timeout: 3000 });
    expect(closingHeading).toBeInTheDocument();
    assertNoScoreLikeText();
  });

  it("options are always accessible buttons with a real character label, enabled while probing", async () => {
    render(<BoutScreen config={{ ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 2 }} />);
    const options = await screen.findAllByRole("button", { name: /^[一-鿿]$/ });
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const option of options) {
      expect(option).toBeEnabled();
    }
  });

  it("renders the parent rating prompt at the closing beat, and Skip settles it without any score appearing", async () => {
    render(<BoutScreen config={{ ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 1 }} />);
    const options = await screen.findAllByRole("button", { name: /^[一-鿿]$/ });
    tap(options[0]!);

    await screen.findByText(/悟空到家了/, {}, { timeout: 3000 });
    const skip = await screen.findByRole("button", { name: "跳过" });
    tap(skip);

    assertNoScoreLikeText();
    expect(screen.queryByRole("button", { name: "跳过" })).not.toBeInTheDocument();
  });

  it("persists the tapped parent rating to the offline queue, linked to this bout's session (adaptivity-instrumentation spec: 'Parent one-tap session rating')", async () => {
    render(<BoutScreen config={{ ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 1 }} />);
    const options = await screen.findAllByRole("button", { name: /^[一-鿿]$/ });
    tap(options[0]!);

    await screen.findByText(/悟空到家了/, {}, { timeout: 3000 });
    const loved = await screen.findByRole("button", { name: COPY.parentRating.loved.label });
    tap(loved);

    await waitFor(async () => {
      const pending = await listPendingRatings();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ rating: "loved" });
      expect(pending[0]!.sessionId).toBeTruthy();
    });
    assertNoScoreLikeText();
  });

  it("shows the journey-trail progress cue mid-bout, and it reaches 100% at the closing beat regardless of which bound fired (add-journey-time-cue)", async () => {
    render(<BoutScreen config={{ ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 1 }} />);
    await screen.findAllByRole("button", { name: /^[一-鿿]$/ });

    const trail = screen.getByTestId("journey-trail");
    expect(trail).toBeInTheDocument();
    assertNoScoreLikeText();

    const options = screen.getAllByRole("button", { name: /^[一-鿿]$/ });
    tap(options[0]!);

    await screen.findByText(/悟空到家了/, {}, { timeout: 3000 });
    const timeFill = screen.getByTestId("journey-trail-time").querySelector("div") as HTMLDivElement;
    const itemFill = screen.getByTestId("journey-trail-item").querySelector("div") as HTMLDivElement;
    await waitFor(() => {
      expect(timeFill.style.width).toBe("100%");
      expect(itemFill.style.width).toBe("100%");
    });
    assertNoScoreLikeText();
  });
});
