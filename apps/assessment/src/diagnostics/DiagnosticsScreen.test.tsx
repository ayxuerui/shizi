import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __resetDBForTests } from "../offline/db.js";
import { __resetPointerGateForTests } from "../input/pointer-gate.js";
import { DiagnosticsScreen } from "./DiagnosticsScreen.js";

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("DiagnosticsScreen (task 10.0 pre-flight checklist, made evidence-based)", () => {
  beforeEach(async () => {
    await resetDatabase();
    __resetPointerGateForTests();
    localStorage.clear();
  });
  afterEach(async () => {
    await resetDatabase();
    __resetPointerGateForTests();
    localStorage.clear();
  });

  it("renders all four checklist sections and an exit control", async () => {
    render(<DiagnosticsScreen onExit={vi.fn()} />);

    expect(await screen.findByText(/\(a\) zh-CN speech/)).toBeInTheDocument();
    expect(screen.getByText(/\(b\) unlock tone audibility/)).toBeInTheDocument();
    expect(screen.getByText(/\(c\) pen and palm rejection/)).toBeInTheDocument();
    expect(screen.getByText(/\(d\) offline \/ storage \/ standalone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exit diagnostics" })).toBeInTheDocument();
  });

  it("calls onExit when the exit button is tapped", async () => {
    const onExit = vi.fn();
    render(<DiagnosticsScreen onExit={onExit} />);
    await screen.findByRole("button", { name: "Exit diagnostics" });

    screen.getByRole("button", { name: "Exit diagnostics" }).click();

    expect(onExit).toHaveBeenCalledOnce();
  });

  it("running the storage check populates the storage rows without throwing", async () => {
    render(<DiagnosticsScreen onExit={vi.fn()} />);
    const checkStorage = await screen.findByRole("button", { name: "Check storage" });

    checkStorage.click();

    await waitFor(() => {
      // getAllByText, not getByText: the raw JSON dump at the bottom of
      // the screen also contains this label text, so more than one match
      // is expected once the check has actually run.
      expect(screen.getAllByText(/IndexedDB connection/).length).toBeGreaterThan(0);
    });
  });

  describe("add-issue-reporting", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("prints build=unknown in the context line when no build id was stamped into the build", async () => {
      render(<DiagnosticsScreen onExit={vi.fn()} />);
      expect(await screen.findByText(/build=unknown/)).toBeInTheDocument();
    });

    it("prints the stamped build id when one is present", async () => {
      vi.stubEnv("VITE_BUILD_ID", "abc1234");
      render(<DiagnosticsScreen onExit={vi.fn()} />);
      expect(await screen.findByText(/build=abc1234/)).toBeInTheDocument();
    });

    it("renders no report button without onOpenReport", async () => {
      render(<DiagnosticsScreen onExit={vi.fn()} />);
      await screen.findByText(/\(a\) zh-CN speech/);
      expect(screen.queryByRole("button", { name: "Report a problem or idea" })).not.toBeInTheDocument();
    });

    it("renders the report button when onOpenReport is provided, and clicking it calls the callback", async () => {
      const onOpenReport = vi.fn();
      render(<DiagnosticsScreen onExit={vi.fn()} onOpenReport={onOpenReport} />);
      const button = await screen.findByRole("button", { name: "Report a problem or idea" });

      button.click();

      expect(onOpenReport).toHaveBeenCalledOnce();
    });
  });

  it("contains no Chinese text anywhere — this screen is deliberately English/ASCII only", async () => {
    render(<DiagnosticsScreen onExit={vi.fn()} />);
    await screen.findByText(/\(a\) zh-CN speech/);
    expect(/[一-鿿]/.test(document.body.textContent ?? "")).toBe(false);
  });
});
