import { describe, expect, it } from "vitest";
import { formatReport, loadStoredReport, saveStoredReport, summarize } from "./report.js";
import type { CheckResult, DiagnosticsReport } from "./types.js";

function fakeStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const store = new Map<string, string>();
  return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
}

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return { id: "x", label: "X", status: "ok", detail: "fine", measuredAt: "2026-08-19T00:00:00.000Z", ...overrides };
}

describe("summarize", () => {
  it("counts ok/attention/unknown, ignoring not-run", () => {
    const checks = [
      check({ status: "ok" }),
      check({ status: "ok" }),
      check({ status: "attention" }),
      check({ status: "unknown" }),
      check({ status: "not-run" }),
    ];
    expect(summarize(checks)).toEqual({ ok: 2, attention: 1, unknown: 1 });
  });
});

describe("formatReport", () => {
  it("contains no CJK codepoints — mechanically proves the font subset is never a factor in reading it", () => {
    const report: DiagnosticsReport = {
      checks: [check({ label: "Speech voices", detail: "1 zh voice found" })],
      verdicts: { x: "confirmed" },
      context: { standalone: true, legacyIosStandalone: undefined, online: true },
    };
    const text = formatReport(report);
    expect(/[一-鿿]/.test(text)).toBe(false);
  });

  it("includes the human verdict when one was recorded", () => {
    const report: DiagnosticsReport = {
      checks: [check({ id: "speech" })],
      verdicts: { speech: "confirmed" },
      context: { standalone: false, legacyIosStandalone: undefined, online: true },
    };
    expect(formatReport(report)).toContain("[human: confirmed]");
  });

  it("omits the verdict suffix when none was recorded", () => {
    const report: DiagnosticsReport = {
      checks: [check({ id: "speech" })],
      verdicts: {},
      context: { standalone: false, legacyIosStandalone: undefined, online: true },
    };
    expect(formatReport(report)).not.toContain("[human:");
  });
});

describe("saveStoredReport / loadStoredReport", () => {
  it("round-trips a report through the injected storage", () => {
    const local = fakeStorage();
    const report: DiagnosticsReport = {
      checks: [check()],
      verdicts: {},
      context: { standalone: false, legacyIosStandalone: undefined, online: true },
    };
    saveStoredReport(report, local);
    expect(loadStoredReport(local)).toEqual(report);
  });

  it("returns null when nothing has been stored yet", () => {
    expect(loadStoredReport(fakeStorage())).toBeNull();
  });

  it("returns null rather than throwing on corrupted stored JSON", () => {
    const local = fakeStorage();
    local.setItem("shizi-diagnostics-report", "not json");
    expect(loadStoredReport(local)).toBeNull();
  });
});
