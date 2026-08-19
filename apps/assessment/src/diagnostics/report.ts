import { STATUS_LABELS } from "./theme.js";
import type { CheckResult, DiagnosticsReport } from "./types.js";

const STORAGE_KEY = "shizi-diagnostics-report";

export interface ReportStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Persisted as each check completes (see `DiagnosticsScreen.tsx`), not
 * only at the end — `vite.config.ts`'s `registerType: "autoUpdate"` means
 * a service-worker update can reload the page mid-run, and losing
 * in-memory-only progress would be a bad failure mode for a screen whose
 * whole point is being trustworthy evidence.
 */
export function saveStoredReport(report: DiagnosticsReport, local: ReportStorageLike = localStorage): void {
  local.setItem(STORAGE_KEY, JSON.stringify(report));
}

export function loadStoredReport(local: ReportStorageLike = localStorage): DiagnosticsReport | null {
  const raw = local.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DiagnosticsReport;
  } catch {
    return null;
  }
}

export function summarize(checks: readonly CheckResult[]): { ok: number; attention: number; unknown: number } {
  let ok = 0;
  let attention = 0;
  let unknown = 0;
  for (const check of checks) {
    if (check.status === "ok") ok += 1;
    else if (check.status === "attention") attention += 1;
    else if (check.status === "unknown") unknown += 1;
  }
  return { ok, attention, unknown };
}

/**
 * Plain-text rendering for a `<pre>` block — on an offline iPad in
 * standalone mode there are no devtools and no export path, so the
 * parent's only way to hand this to anyone is a screenshot. English/
 * ASCII only (this whole module is parent-facing tooling — see
 * `DiagnosticsScreen.tsx`'s header comment on why that's load-bearing,
 * not stylistic), which also mechanically proves the font subset can
 * never be a factor in reading it.
 */
export function formatReport(report: DiagnosticsReport): string {
  const lines: string[] = [];
  lines.push(`standalone=${report.context.standalone} online=${report.context.online}`);
  if (report.context.legacyIosStandalone !== undefined) {
    lines.push(`navigator.standalone=${report.context.legacyIosStandalone}`);
  }
  lines.push("");
  for (const check of report.checks) {
    const verdict = report.verdicts[check.id];
    const verdictSuffix = verdict ? ` [human: ${verdict}]` : "";
    lines.push(`[${STATUS_LABELS[check.status]}] ${check.label}: ${check.detail}${verdictSuffix}`);
  }
  return lines.join("\n");
}
