import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { __resetDBForTests } from "./offline/db.js";
import { App } from "./App.js";

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

// jsdom has no PointerEvent constructor — see BoutScreen.test.tsx's `tap`
// doc comment for why a plain, act()-wrapped Event with assigned
// properties is dispatched (and handled) identically to a real one.
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

describe("App (task 8.3: first-gesture audio-unlock screen)", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("shows the unlock screen before anything else", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "点一下开始" })).toBeInTheDocument();
  });

  it("proceeds to the assessment after the unlock tap", async () => {
    render(<App />);
    tap(screen.getByRole("button", { name: "点一下开始" }));

    expect(await screen.findByTestId("wukong")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "点一下开始" })).not.toBeInTheDocument();
  });
});
