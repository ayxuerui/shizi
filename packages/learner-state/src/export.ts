import type { LearnerEvent } from "./types.js";

/**
 * Serializes any list of records to newline-delimited JSON — storage-
 * agnostic, no dependency on where the records came from. Originally
 * written for `LearnerEvent` only (per `learner-state` spec's "Durable
 * repo-side export" requirement); generalized once a second caller
 * (`offline/sync.ts`'s assignment serializer) and a third (session
 * ratings, `adaptivity-instrumentation`'s one-tap rating requirement)
 * needed the identical shape — see `exportToJsonl`/`toJsonl` below.
 */
export function toJsonl<T>(records: readonly T[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length > 0 ? "\n" : "");
}

/** Inverse of `toJsonl`, for re-loading an exported file (e.g. in tests, or Section 9's replay tooling). */
export function fromJsonl<T>(contents: string): T[] {
  return contents
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/** Typed alias kept for existing call sites and the spec's own wording ("Durable repo-side export" of events). */
export function exportToJsonl(events: readonly LearnerEvent[]): string {
  return toJsonl(events);
}

/** Typed alias of `fromJsonl`, kept for existing call sites. */
export function parseJsonl(contents: string): LearnerEvent[] {
  return fromJsonl<LearnerEvent>(contents);
}
