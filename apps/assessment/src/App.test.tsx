import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("App (task 8.3: first-gesture audio-unlock screen; task 9.4: published-config bootstrap)", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("shows the unlock screen once the published-config bootstrap resolves (falls back to the bundled pool in jsdom, where /config.json isn't fetchable)", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "点一下开始" })).toBeInTheDocument();
  });

  it("proceeds to the assessment after the unlock tap", async () => {
    render(<App />);
    const unlockButton = await screen.findByRole("button", { name: "点一下开始" });
    tap(unlockButton);

    expect(await screen.findByTestId("wukong")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "点一下开始" })).not.toBeInTheDocument();
  });

  it("regression guard: with no hash and no long-press, the DiagnosticsScreen itself is never mounted — only its unlabeled entry affordance is present", async () => {
    render(<App />);
    await screen.findByRole("button", { name: "点一下开始" });
    expect(screen.queryByText(/Diagnostics \(task 10.0/)).not.toBeInTheDocument();
    // The corner long-press affordance (entry.ts's OTHER mechanism, alongside #diagnostics) is
    // expected to be present here — it's what makes diagnostics reachable at all from standalone mode.
    expect(screen.queryByRole("button", { name: "device diagnostics" })).toBeInTheDocument();
  });

  it("shows the diagnostics screen instead of the unlock gate when #diagnostics is set", async () => {
    window.location.hash = "#diagnostics";
    render(<App />);
    expect(await screen.findByText(/Diagnostics \(task 10.0/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "点一下开始" })).not.toBeInTheDocument();
    window.location.hash = "";
  });

  describe("add-dev-deployment: EnvBadge containment (specs/deployment/spec.md: 'Deployed builds declare their environment')", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("shows the environment marker on the unlock screen for a dev build", async () => {
      vi.stubEnv("VITE_APP_ENV", "dev");
      render(<App />);
      await screen.findByRole("button", { name: "点一下开始" });
      expect(screen.getByLabelText("environment: dev")).toBeInTheDocument();
    });

    it("never carries the environment marker into the child-facing bout tree, even for a dev build", async () => {
      vi.stubEnv("VITE_APP_ENV", "dev");
      render(<App />);
      const unlockButton = await screen.findByRole("button", { name: "点一下开始" });
      expect(screen.getByLabelText("environment: dev")).toBeInTheDocument();

      tap(unlockButton);
      await screen.findByTestId("wukong");

      // The marker is gone along with the rest of the unlock screen — it
      // must never render inside the bout tree BoutScreen.test.tsx's own
      // assertNoScoreLikeText guarantee protects (that check only catches
      // digits/"%", not a "DEV" label, so this needs its own assertion).
      expect(screen.queryByLabelText("environment: dev")).not.toBeInTheDocument();
    });

    it("shows no environment marker at all for a default (production) build", async () => {
      render(<App />);
      await screen.findByRole("button", { name: "点一下开始" });
      expect(screen.queryByLabelText(/^environment:/)).not.toBeInTheDocument();
    });
  });
});
