/**
 * add-dev-deployment: satisfies specs/deployment/spec.md's "Deployed
 * builds declare their environment" requirement — the in-app half of
 * it, alongside vite.config.ts's manifest name/short_name swap. Renders
 * nothing at all in a production build (no `VITE_APP_ENV`), so a prod
 * build is byte-for-byte unchanged from before this component existed.
 *
 * Rendered ONLY from `AudioUnlockGate` and `DiagnosticsScreen` — the two
 * screens the child's own bout/session tree never mounts alongside (see
 * `App.tsx`'s either/or rendering). Never render this from `BoutScreen`
 * or anything under it: `BoutScreen.test.tsx`'s `assertNoScoreLikeText`
 * sweep asserts no digit/status-like text ever appears in that tree, and
 * this is exactly the kind of "just this once" addition that guarantee
 * exists to block.
 *
 * A module-local palette, not a new `styles/tokens.css` token — same
 * reasoning as `diagnostics/theme.ts`'s status colors: this is
 * parent-facing environment metadata, not something the shared design
 * system should have a color for.
 */
const ENV_BADGE_LABEL: Record<string, string> = {
  dev: "DEV",
};

export function EnvBadge() {
  const appEnv = import.meta.env.VITE_APP_ENV as string | undefined;
  const label = appEnv ? ENV_BADGE_LABEL[appEnv] : undefined;
  if (!label) return null;

  return (
    <div
      aria-label={`environment: ${appEnv}`}
      style={{
        // Fixed, not absolute: the two call sites (AudioUnlockGate,
        // DiagnosticsScreen) don't share a common positioned-ancestor
        // convention, and viewport-fixed placement means this doesn't
        // need to know or care what either wraps it in.
        position: "fixed",
        top: "0.5rem",
        left: "0.5rem",
        zIndex: 1000,
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-sm, 4px)",
        background: "#4a5a7a",
        color: "#fff",
        fontFamily: "ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, monospace",
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        pointerEvents: "none",
      }}
    >
      {label}
    </div>
  );
}
