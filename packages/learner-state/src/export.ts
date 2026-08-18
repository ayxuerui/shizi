import type { LearnerEvent } from "./types.js";

/**
 * Serializes events to newline-delimited JSON, per `learner-state`
 * spec's "Durable repo-side export" requirement — a version-controlled,
 * human-inspectable format independent of hosted-database storage.
 *
 * Storage-agnostic on purpose: this is the reusable core. Task 9.5's
 * D1-specific pull script (which doesn't exist until Section 9's
 * Cloudflare infra is provisioned) is expected to fetch events from D1
 * and call this function — this function itself has no dependency on
 * where the events came from.
 */
export function exportToJsonl(events: readonly LearnerEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : "");
}

/** Inverse of exportToJsonl, for re-loading an exported file (e.g. in tests, or Section 9's replay tooling). */
export function parseJsonl(contents: string): LearnerEvent[] {
  return contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LearnerEvent);
}
