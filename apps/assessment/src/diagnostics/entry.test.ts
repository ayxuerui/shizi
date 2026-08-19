import { describe, expect, it, vi } from "vitest";
import { clearDiagnosticsHash, isDiagnosticsRequested } from "./entry.js";

describe("isDiagnosticsRequested", () => {
  it("is true for exactly #diagnostics", () => {
    expect(isDiagnosticsRequested({ hash: "#diagnostics" })).toBe(true);
  });

  it("is false for no hash", () => {
    expect(isDiagnosticsRequested({ hash: "" })).toBe(false);
  });

  it("is false for an unrelated hash", () => {
    expect(isDiagnosticsRequested({ hash: "#other" })).toBe(false);
  });
});

describe("clearDiagnosticsHash", () => {
  it("replaces the URL without the fragment when diagnostics was requested", () => {
    const replaceState = vi.fn();
    const win = {
      location: {
        hash: "#diagnostics",
        protocol: "https:",
        host: "shizi.realxco.com",
        pathname: "/assessment/",
        search: "",
      },
      history: { replaceState },
    };

    clearDiagnosticsHash(win);

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "https://shizi.realxco.com/assessment/");
  });

  it("does nothing when diagnostics was not requested", () => {
    const replaceState = vi.fn();
    const win = {
      location: { hash: "", protocol: "https:", host: "x", pathname: "/", search: "" },
      history: { replaceState },
    };

    clearDiagnosticsHash(win);

    expect(replaceState).not.toHaveBeenCalled();
  });
});
