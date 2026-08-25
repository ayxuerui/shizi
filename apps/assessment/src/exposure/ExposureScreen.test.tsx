import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { assembleCandidatePool, PHASE_A_SEQUENCE } from "@shizi/character-data";
import { __resetDBForTests } from "../offline/db.js";
import { listPendingEvents } from "../offline/event-queue.js";
import { COPY } from "../copy.js";
import { ExposureScreen } from "./ExposureScreen.js";

const pool = assembleCandidatePool();

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Same synthetic-pointer-event tap as BoutScreen.test.tsx — TapTarget
 * only listens for pointer events, not click. */
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

/** No digit and no "%" anywhere in the rendered DOM — mirrors
 * BoutScreen.test.tsx's regression guard for the same no-score-like-text
 * guarantee, which the `exposure` spec also requires ("No grading or
 * failure state"). */
function assertNoScoreLikeText(): void {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\d/);
  expect(text).not.toContain("%");
}

describe("ExposureScreen (exposure spec: 'No grading or failure state', 'Arm-bound exposure delivery')", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  // Forces every arm resolution to index 0 ("listen") — keeps this
  // test off the trace arm entirely, which needs a real hanzi-writer/SVG
  // environment jsdom doesn't provide.
  const forceListenDeps = { random: () => 0 };

  it("walks a 2-character learn bout via the listen arm, with no score-like text, and reaches the closing beat", async () => {
    const onDone = vi.fn();
    render(
      <ExposureScreen
        pool={pool}
        characters={PHASE_A_SEQUENCE.slice(0, 2)}
        onDone={onDone}
        deps={forceListenDeps}
      />,
    );

    const first = await screen.findByRole("button", { name: "知道了，继续" });
    assertNoScoreLikeText();
    expect(screen.getByText(PHASE_A_SEQUENCE[0]!)).toBeInTheDocument();
    tap(first);

    await waitFor(
      () => {
        expect(screen.getByText(PHASE_A_SEQUENCE[1]!)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    assertNoScoreLikeText();
    tap(screen.getByRole("button", { name: "知道了，继续" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    assertNoScoreLikeText();
  });

  it("logs a full LearnerEvent per completed item, with module and activity set to the delivered learn/listen shape", async () => {
    const onDone = vi.fn();
    render(
      <ExposureScreen pool={pool} characters={[PHASE_A_SEQUENCE[0]!]} onDone={onDone} deps={forceListenDeps} />,
    );

    const target = await screen.findByRole("button", { name: "知道了，继续" });
    tap(target);

    await waitFor(async () => {
      const pending = await listPendingEvents();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ character: PHASE_A_SEQUENCE[0], activity: "listen", outcome: "correct" });
    });
  });

  it("reaches the closing beat without ever rendering a parent-rating prompt (scoped to the assessment capability, not exposure)", async () => {
    const onDone = vi.fn();
    render(
      <ExposureScreen pool={pool} characters={[PHASE_A_SEQUENCE[0]!]} onDone={onDone} deps={forceListenDeps} />,
    );

    tap(await screen.findByRole("button", { name: "知道了，继续" }));

    await screen.findByText(COPY.closing.title, {}, { timeout: 3000 });
    expect(screen.queryByRole("button", { name: COPY.parentRating.skip })).not.toBeInTheDocument();
  });
});
