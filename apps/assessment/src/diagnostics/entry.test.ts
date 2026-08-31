import { describe, expect, it, vi } from "vitest";
import {
  clearDiagnosticsHash,
  clearParentScreenHash,
  isDiagnosticsRequested,
  requestedParentScreen,
} from "./entry.js";

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

describe("requestedParentScreen (add-issue-reporting: a second fragment in the app's only URL read)", () => {
  it("maps #diagnostics to the diagnostics screen", () => {
    expect(requestedParentScreen({ hash: "#diagnostics" })).toBe("diagnostics");
  });

  it("maps #report to the report form", () => {
    expect(requestedParentScreen({ hash: "#report" })).toBe("report");
  });

  it("is null for no hash or an unrelated hash", () => {
    expect(requestedParentScreen({ hash: "" })).toBeNull();
    expect(requestedParentScreen({ hash: "#other" })).toBeNull();
  });

  it("keeps isDiagnosticsRequested's exact semantics — #report is not diagnostics", () => {
    expect(isDiagnosticsRequested({ hash: "#report" })).toBe(false);
  });
});

describe("clearParentScreenHash", () => {
  it("replaces the URL without the fragment when #report was requested", () => {
    const replaceState = vi.fn();
    const win = {
      location: { hash: "#report", protocol: "https:", host: "shizi.realxco.com", pathname: "/assessment/", search: "" },
      history: { replaceState },
    };

    clearParentScreenHash(win);

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "https://shizi.realxco.com/assessment/");
  });

  it("also clears #diagnostics, so App.tsx needs only one exit path", () => {
    const replaceState = vi.fn();
    const win = {
      location: { hash: "#diagnostics", protocol: "https:", host: "x", pathname: "/", search: "" },
      history: { replaceState },
    };

    clearParentScreenHash(win);

    expect(replaceState).toHaveBeenCalledOnce();
  });

  it("does nothing when neither fragment is present", () => {
    const replaceState = vi.fn();
    const win = {
      location: { hash: "#other", protocol: "https:", host: "x", pathname: "/", search: "" },
      history: { replaceState },
    };

    clearParentScreenHash(win);

    expect(replaceState).not.toHaveBeenCalled();
  });
});
