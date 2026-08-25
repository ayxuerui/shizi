import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { assembleCandidatePool } from "@shizi/character-data";
import { __resetDBForTests } from "../offline/db.js";
import { listPendingEvents } from "../offline/event-queue.js";
import { MemoryScreen } from "./MemoryScreen.js";

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

function assertNoScoreLikeText(): void {
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/\d/);
  expect(text).not.toContain("%");
}

describe("MemoryScreen (daily-memory review, reusing ProbePanel/assessment's no-score guarantee)", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("walks a 2-character review bout in the given order, with no score-like text, and reaches the closing beat", async () => {
    const onDone = vi.fn();
    render(<MemoryScreen pool={pool} characters={["山", "水"]} onDone={onDone} />);

    const first = await screen.findByRole("button", { name: "山" });
    assertNoScoreLikeText();
    tap(first);

    await waitFor(() => screen.getByRole("button", { name: "水" }), { timeout: 3000 });
    assertNoScoreLikeText();
    tap(screen.getByRole("button", { name: "水" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 3000 });
    assertNoScoreLikeText();
  });

  it("logs a hear-tap recognition event per response, so a miss can demote the character via the normal mastery projection", async () => {
    const onDone = vi.fn();
    render(<MemoryScreen pool={pool} characters={["山"]} onDone={onDone} />);

    const target = await screen.findByRole("button", { name: "山" });
    tap(target);

    await waitFor(async () => {
      const pending = await listPendingEvents();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({ character: "山", module: "review", activity: "hear-tap", outcome: "correct" });
    });
  });
});
