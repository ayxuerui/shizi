/**
 * Diagnostics status colors — deliberately module-local TS constants, NOT
 * CSS custom properties added to `styles/tokens.css`. That file's absence
 * of `--color-error`/`--color-danger` is itself the enforcement mechanism
 * behind the "no visible scoring or failure state" requirement (see its
 * header comment): a child-facing component author has nothing red to
 * reach for. Adding a global error token "just for diagnostics" would
 * hand every component in the app that same red. This screen is
 * parent-facing, pre-flight tooling and never reachable from the child's
 * session (see `App.tsx`'s either/or rendering) — its own local palette
 * doesn't need, and must not become, a shared token.
 *
 * Text is the primary carrier (`OK` / `ATTENTION` / `UNKNOWN` / `NOT RUN`
 * literally in a monospace column); color is secondary reinforcement, and
 * "attention" is a desaturated slate, not alarm red — legible as "look
 * here" without importing failure semantics into the app's palette.
 */
export const DIAGNOSTICS_FONT_FAMILY = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';

export const STATUS_COLORS: Record<"ok" | "attention" | "unknown" | "not-run", string> = {
  ok: "#2f6b4f",
  attention: "#4a5a7a",
  unknown: "#6b6357",
  "not-run": "#9a9186",
};

export const STATUS_LABELS: Record<"ok" | "attention" | "unknown" | "not-run", string> = {
  ok: "OK",
  attention: "ATTENTION",
  unknown: "UNKNOWN",
  "not-run": "NOT RUN",
};
