import type { LearnerEvent } from "./types.js";
import { validateEvent } from "./validation.js";

export type AppendResult =
  | { status: "appended" }
  | { status: "duplicate" } // re-sent event id — expected on retry, not an error
  | { status: "rejected"; errors: string[] };

/**
 * Append-only event log, per `learner-state` spec's "Event log is
 * append-only and canonical" requirement. Deliberately exposes no
 * update/delete method at all — the easiest way to guarantee "no
 * destructive writes" is to not have an API surface capable of one.
 */
export class EventLog {
  private readonly events: LearnerEvent[] = [];
  private readonly idsSeen = new Set<string>();

  append(candidate: unknown): AppendResult {
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "id" in candidate &&
      this.idsSeen.has((candidate as { id: unknown }).id as string)
    ) {
      return { status: "duplicate" };
    }

    const result = validateEvent(candidate);
    if (!result.valid) {
      return { status: "rejected", errors: result.errors };
    }

    const event = candidate as LearnerEvent;
    this.events.push(event);
    this.idsSeen.add(event.id);
    return { status: "appended" };
  }

  /** A defensive copy — callers cannot mutate the log through this. */
  getEvents(): readonly LearnerEvent[] {
    return [...this.events];
  }

  get size(): number {
    return this.events.length;
  }
}
