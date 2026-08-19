import { exportToJsonl, toJsonl } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";
import { getSyncConfig } from "./endpoint.js";
import {
  listPendingAssignments,
  listPendingEvents,
  listPendingRatings,
  markAssignmentsSynced,
  markEventsSynced,
  markRatingsSynced,
} from "./event-queue.js";

export type FlushResult =
  | { status: "skipped"; reason: string }
  | { status: "flushed"; eventsCount: number; assignmentsCount: number; ratingsCount: number }
  | { status: "failed"; reason: string };

export interface FlushDeps {
  fetchImpl?: typeof fetch;
  isOnline?: () => boolean;
}

function serializeAssignments(assignments: readonly ArmAssignment[]): string {
  return toJsonl(assignments);
}

function serializeRatings(ratings: readonly SessionRating[]): string {
  return toJsonl(ratings);
}

async function postNdjson(
  fetchImpl: typeof fetch,
  url: string,
  token: string | undefined,
  body: string,
): Promise<Response> {
  return fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body,
  });
}

/**
 * Opportunistic flush of the local outbox (events, assignments, AND
 * session ratings — task 9.2's sync-service exposes /events,
 * /assignments, and /ratings as three sibling routes, `config.endpoint`
 * is their shared base URL) to the self-hosted sync endpoint (design.md:
 * Cloudflare Pages/Worker/D1 → self-hosted, see that decision entry).
 * Per `assessment` spec's "Full offline operation" requirement — NEVER
 * throws. Any failure (no endpoint configured, offline, non-2xx
 * response, a thrown fetch) leaves the queue exactly as it was, to be
 * retried on the next opportunity, and is invisible to the child:
 * nothing here should ever surface as a UI error.
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
    const [pendingEvents, pendingAssignments, pendingRatings] = await Promise.all([
      listPendingEvents(),
      listPendingAssignments(),
      listPendingRatings(),
    ]);

    if (pendingEvents.length === 0 && pendingAssignments.length === 0 && pendingRatings.length === 0) {
      return { status: "skipped", reason: "nothing pending" };
    }

    if (pendingEvents.length > 0) {
      const response = await postNdjson(
        fetchImpl,
        `${config.endpoint}/events`,
        config.token,
        exportToJsonl(pendingEvents),
      );
      if (!response.ok) return { status: "failed", reason: `events HTTP ${response.status}` };
      await markEventsSynced(pendingEvents.map((event) => event.id));
    }

    if (pendingAssignments.length > 0) {
      const response = await postNdjson(
        fetchImpl,
        `${config.endpoint}/assignments`,
        config.token,
        serializeAssignments(pendingAssignments.map((p) => p.assignment)),
      );
      if (!response.ok) return { status: "failed", reason: `assignments HTTP ${response.status}` };
      await markAssignmentsSynced(pendingAssignments.map((p) => p.key));
    }

    if (pendingRatings.length > 0) {
      const response = await postNdjson(
        fetchImpl,
        `${config.endpoint}/ratings`,
        config.token,
        serializeRatings(pendingRatings),
      );
      if (!response.ok) return { status: "failed", reason: `ratings HTTP ${response.status}` };
      await markRatingsSynced(pendingRatings.map((rating) => rating.sessionId));
    }

    return {
      status: "flushed",
      eventsCount: pendingEvents.length,
      assignmentsCount: pendingAssignments.length,
      ratingsCount: pendingRatings.length,
    };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
