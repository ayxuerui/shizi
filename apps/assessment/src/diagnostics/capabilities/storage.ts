import { getDB } from "../../offline/db.js";
import type { CheckResult } from "../types.js";

const FIRST_OPEN_KEY = "shizi-diagnostics-first-open";

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StorageManagerLike {
  estimate?(): Promise<{ usage?: number; quota?: number }>;
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
}

export interface StorageProbeDeps {
  storage?: StorageManagerLike;
  local?: LocalStorageLike;
  now?: () => string;
  /** Injected so tests don't touch the app's real IndexedDB store — see doc comment below. */
  openDb?: () => Promise<unknown>;
}

/**
 * Ports `spikes/ios-constraints/index.html`'s storage-persistence probes.
 * The IndexedDB check reuses `offline/db.ts`'s `getDB()` — the SAME
 * connection this app's real offline queue depends on — but only ever
 * READS from it (confirms the connection opens and a store is
 * enumerable). It deliberately does NOT write a diagnostic marker row
 * into the shared `events`/`assignments`/`ratings` stores: those hold
 * real learner data, and a synthetic diagnostic write has no safe way to
 * guarantee its own later removal without risking a real row. A failed
 * `getDB()` call is exactly as informative as a failed write would have
 * been for "is IndexedDB actually usable here."
 *
 * `persist()` is intentionally NOT called by this function — see
 * `requestPersistence` below, wired to an explicit button. Opening this
 * screen must not silently change the device's storage eviction policy.
 */
export async function probeStorage(deps: StorageProbeDeps = {}): Promise<CheckResult[]> {
  const now = deps.now ?? (() => new Date().toISOString());
  const results: CheckResult[] = [];

  if (deps.local) {
    const existing = deps.local.getItem(FIRST_OPEN_KEY);
    if (existing) {
      results.push({
        id: "storage-first-open",
        label: "localStorage first-open marker",
        status: "ok",
        detail: `First recorded at ${existing} — if this reset unexpectedly, storage was evicted.`,
        measuredAt: now(),
      });
    } else {
      const recordedAt = now();
      deps.local.setItem(FIRST_OPEN_KEY, recordedAt);
      results.push({
        id: "storage-first-open",
        label: "localStorage first-open marker",
        status: "ok",
        detail: `Recorded now: ${recordedAt}. Re-run diagnostics later to confirm this persists.`,
        measuredAt: recordedAt,
      });
    }
  }

  const openDb = deps.openDb ?? getDB;
  try {
    await openDb();
    results.push({
      id: "storage-indexeddb",
      label: "IndexedDB connection",
      status: "ok",
      detail: "The app's real offline-queue database opened successfully.",
      measuredAt: now(),
    });
  } catch (error) {
    results.push({
      id: "storage-indexeddb",
      label: "IndexedDB connection",
      status: "attention",
      detail: error instanceof Error ? error.message : String(error),
      measuredAt: now(),
    });
  }

  if (deps.storage?.estimate) {
    try {
      const estimate = await deps.storage.estimate();
      results.push({
        id: "storage-estimate",
        label: "navigator.storage.estimate()",
        status: "ok",
        detail: `usage=${estimate.usage ?? "unknown"} quota=${estimate.quota ?? "unknown"}`,
        measuredAt: now(),
      });
    } catch (error) {
      results.push({
        id: "storage-estimate",
        label: "navigator.storage.estimate()",
        status: "unknown",
        detail: error instanceof Error ? error.message : String(error),
        measuredAt: now(),
      });
    }
  } else {
    results.push({
      id: "storage-estimate",
      label: "navigator.storage.estimate()",
      status: "unknown",
      detail: "Not supported on this browser.",
      measuredAt: now(),
    });
  }

  return results;
}

/**
 * Split out from `probeStorage` and wired to an explicit button (see
 * `DiagnosticsScreen.tsx`) — a diagnostics screen mounting must not
 * silently request persistent storage as a side effect of being opened.
 */
export async function requestPersistence(storage: StorageManagerLike | undefined, now: () => string = () => new Date().toISOString()): Promise<CheckResult> {
  if (!storage?.persist) {
    return {
      id: "storage-persist",
      label: "navigator.storage.persist()",
      status: "unknown",
      detail: "Not supported on this browser.",
      measuredAt: now(),
    };
  }
  try {
    const granted = await storage.persist();
    return {
      id: "storage-persist",
      label: "navigator.storage.persist()",
      status: granted ? "ok" : "attention",
      detail: `granted=${granted}`,
      measuredAt: now(),
    };
  } catch (error) {
    return {
      id: "storage-persist",
      label: "navigator.storage.persist()",
      status: "attention",
      detail: error instanceof Error ? error.message : String(error),
      measuredAt: now(),
    };
  }
}
