/**
 * The app's only URL read. The adult-facing screens have two entry
 * points each: a corner long-press on the unlock screen (`long-press.ts`
 * + `DiagnosticsCornerTrigger.tsx`, works even in standalone/home-screen
 * mode, so it's the one that actually satisfies task 10.0's airplane-mode
 * check — and, via the diagnostics screen's own button, the way the
 * report form is reached on a real device) and a URL fragment, kept only
 * as a fast dev/desk-testing convenience in ordinary Safari — a `VITE_*`
 * env flag was deliberately rejected as the entry mechanism since
 * toggling it needs a rebuild+redeploy, meaning the build you'd be
 * diagnosing would never be the build you actually shipped.
 *
 * add-issue-reporting added the second fragment (`#report`). Both are
 * read HERE and nowhere else, which is what "the app's only URL read"
 * has always meant — one module, not one string.
 */
export const DIAGNOSTICS_HASH = "#diagnostics";
export const REPORT_HASH = "#report";

/** The adult-facing screens `App.tsx` can show instead of the child's tree. */
export type ParentScreen = "diagnostics" | "report";

export interface LocationLike {
  hash: string;
}

export function requestedParentScreen(loc: LocationLike): ParentScreen | null {
  if (loc.hash === DIAGNOSTICS_HASH) return "diagnostics";
  if (loc.hash === REPORT_HASH) return "report";
  return null;
}

export function isDiagnosticsRequested(loc: LocationLike): boolean {
  return requestedParentScreen(loc) === "diagnostics";
}

export interface FullLocationLike extends LocationLike {
  protocol: string;
  host: string;
  pathname: string;
  search: string;
}

export interface HistoryLocationLike {
  location: FullLocationLike;
  history: Pick<History, "replaceState">;
}

/** Clears either fragment so a reload doesn't bounce straight back into an adult-facing screen. */
export function clearParentScreenHash(win: HistoryLocationLike): void {
  if (requestedParentScreen(win.location) === null) return;
  const { protocol, host, pathname, search } = win.location;
  win.history.replaceState(null, "", `${protocol}//${host}${pathname}${search}`);
}

/** Clears the fragment so a reload doesn't bounce straight back into diagnostics. */
export function clearDiagnosticsHash(win: HistoryLocationLike): void {
  if (!isDiagnosticsRequested(win.location)) return;
  clearParentScreenHash(win);
}
