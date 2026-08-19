import type { CheckResult, EnvironmentInfo } from "../types.js";

export interface ServiceWorkerLike {
  controller?: unknown;
  getRegistrations?(): Promise<readonly unknown[]>;
}

export interface CacheLike {
  match(request: string, options?: { ignoreSearch?: boolean }): Promise<unknown>;
}

export interface CacheStorageLike {
  keys(): Promise<readonly string[]>;
  open(name: string): Promise<CacheLike>;
}

export interface MatchMediaLike {
  (query: string): { matches: boolean };
}

export interface SwProbeDeps {
  serviceWorker?: ServiceWorkerLike;
  caches?: CacheStorageLike;
  isOnline?: () => boolean;
  matchMedia?: MatchMediaLike;
  navigatorStandalone?: boolean;
  criticalPaths?: readonly string[];
  now?: () => string;
}

/**
 * Nothing in `src/` touches `navigator.serviceWorker`/`caches` at all
 * today (vite-plugin-pwa auto-injects registration at build time) — this
 * is greenfield observability for task 10.0's item (d).
 *
 * Gotcha this MUST get right: workbox precache entries carry a
 * `?__WB_REVISION__=...` query string. A naive `cache.match(url)` would
 * report every precached asset as missing — `ignoreSearch: true` is not
 * optional here.
 */
export async function probeServiceWorker(deps: SwProbeDeps = {}): Promise<CheckResult[]> {
  const now = deps.now ?? (() => new Date().toISOString());
  const results: CheckResult[] = [];

  if (!deps.serviceWorker) {
    results.push({
      id: "sw-supported",
      label: "Service worker support",
      status: "attention",
      detail: "navigator.serviceWorker is not available in this context.",
      measuredAt: now(),
    });
    return results;
  }

  results.push({
    id: "sw-controller",
    label: "Service worker controlling this page",
    status: deps.serviceWorker.controller ? "ok" : "attention",
    detail: deps.serviceWorker.controller ? "A service worker is controlling this page." : "No controller yet — a fresh load or an update in progress.",
    measuredAt: now(),
  });

  if (deps.serviceWorker.getRegistrations) {
    const registrations = await deps.serviceWorker.getRegistrations();
    results.push({
      id: "sw-registrations",
      label: "Service worker registrations",
      status: registrations.length > 0 ? "ok" : "attention",
      detail: `${registrations.length} registration(s).`,
      measuredAt: now(),
    });
  }

  if (deps.caches && deps.criticalPaths && deps.criticalPaths.length > 0) {
    const cacheNames = await deps.caches.keys();
    const missing: string[] = [];
    for (const path of deps.criticalPaths) {
      let found = false;
      for (const name of cacheNames) {
        const cache = await deps.caches.open(name);
        if (await cache.match(path, { ignoreSearch: true })) {
          found = true;
          break;
        }
      }
      if (!found) missing.push(path);
    }
    results.push({
      id: "sw-precache-assets",
      label: "Critical assets present in the precache",
      status: missing.length === 0 ? "ok" : "attention",
      detail:
        missing.length === 0
          ? `All ${deps.criticalPaths.length} critical assets found.`
          : `Missing: ${missing.join(", ")}`,
      measuredAt: now(),
    });
  }

  return results;
}

export function describeEnvironment(deps: SwProbeDeps = {}): EnvironmentInfo {
  return {
    standalone: deps.matchMedia?.("(display-mode: standalone)").matches ?? false,
    legacyIosStandalone: deps.navigatorStandalone,
    online: deps.isOnline?.() ?? true,
  };
}
