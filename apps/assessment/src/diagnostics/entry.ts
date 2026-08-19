/**
 * The app's only URL read. Diagnostics has two entry points: a corner
 * long-press on the unlock screen (`long-press.ts` + `DiagnosticsCornerTrigger.tsx`,
 * works even in standalone/home-screen mode, so it's the one that
 * actually satisfies task 10.0's airplane-mode check) and this hash, kept
 * only as a fast dev/desk-testing convenience in ordinary Safari — a
 * `VITE_*` env flag was deliberately rejected as the entry mechanism
 * since toggling it needs a rebuild+redeploy, meaning the build you'd be
 * diagnosing would never be the build you actually shipped.
 */
export const DIAGNOSTICS_HASH = "#diagnostics";

export interface LocationLike {
  hash: string;
}

export function isDiagnosticsRequested(loc: LocationLike): boolean {
  return loc.hash === DIAGNOSTICS_HASH;
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

/** Clears the fragment so a reload doesn't bounce straight back into diagnostics. */
export function clearDiagnosticsHash(win: HistoryLocationLike): void {
  if (!isDiagnosticsRequested(win.location)) return;
  const { protocol, host, pathname, search } = win.location;
  win.history.replaceState(null, "", `${protocol}//${host}${pathname}${search}`);
}
