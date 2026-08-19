/**
 * Shared shape for every diagnostics check. Deliberately parent-facing
 * only (see `theme.ts`'s header comment on why this never reuses the
 * child-facing `--color-error`-free token set) — this whole module is
 * out-of-band tooling for task 10.0's pre-flight checklist, not a
 * specified learner-facing capability.
 */
export type CheckStatus = "ok" | "attention" | "unknown" | "not-run";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  measuredAt: string;
}

/**
 * The machine can only ever produce evidence (a voice object exists, an
 * event fired, a byte counter advanced) — never a verdict on anything a
 * human ear or hand must judge (audibility, intelligibility, whether a
 * real Pencil's palm rejection actually held up). Kept as a separate
 * field from `CheckResult` so the two are never conflated: see
 * `report.ts`'s doc comment and the plan's "Testable vs. human-only"
 * section.
 */
export type HumanVerdict = "confirmed" | "denied" | "unanswered";

export interface EnvironmentInfo {
  standalone: boolean;
  legacyIosStandalone: boolean | undefined;
  online: boolean;
}

export interface DiagnosticsReport {
  checks: CheckResult[];
  verdicts: Record<string, HumanVerdict>;
  context: EnvironmentInfo;
}
