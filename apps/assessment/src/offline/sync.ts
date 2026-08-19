import { exportToJsonl } from "@shizi/learner-state";
import { getSyncConfig } from "./endpoint.js";
import { listPendingEvents, markEventsSynced } from "./event-queue.js";

export type FlushResult =
  | { status: "skipped"; reason: string }
  | { status: "flushed"; count: number }
  | { status: "failed"; reason: string };

export interface FlushDeps {
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}

/**
 * Opportunistic flush of the local outbox to the (eventually real, per
 * Section 9) sync endpoint. Per `assessment` spec's "Full offline
 * operation" requirement — NEVER throws. Any failure (no endpoint
 * configured, offline, non-2xx response, a thrown fetch) leaves the
 * queue exactly as it was, to be retried on the next opportunity, and is
 * invisible to the child: nothing here should ever surface as a UI error.
 */
export async function flushQueue(deps: FlushDeps = {}): Promise<FlushResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const isOnline = deps.isOnline ?? (() => typeof navigator === "undefined" || navigator.onLine);

  const config = getSyncConfig();
  if (!config) {
    return { status: "skipped", reason: "no sync endpoint configured (Section 9 not deployed yet)" };
  }
  if (!isOnline()) {
    return { status: "skipped", reason: "offline" };
  }

  try {
    const pending = await listPendingEvents();
    if (pending.length === 0) {
      return { status: "skipped", reason: "nothing pending" };
    }

    const body = exportToJsonl(pending);
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-ndjson",
        Authorization: `Bearer ${config.token ?? ""}`,
      },
      body,
    });

    if (!response.ok) {
      return { status: "failed", reason: `HTTP ${response.status}` };
    }

    await markEventsSynced(pending.map((event) => event.id));
    return { status: "flushed", count: pending.length };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
