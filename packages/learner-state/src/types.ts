/**
 * Outcome of a single character-recognition interaction. This schema is
 * specifically for character-interaction events (assessment probes,
 * future tracing/word-building arms) — not a general-purpose event bus.
 */
export type Outcome = "correct" | "incorrect";

export type MasteryState = "unseen" | "probing" | "known" | "shaky";

/**
 * A single learner-interaction event, per `learner-state` spec's "Event
 * schema captures interaction context" requirement. Every field here is
 * required — see `validation.ts`. `id` is the idempotency key (spec:
 * "Offline durability and idempotent sync").
 */
export interface LearnerEvent {
  /** Client-generated, globally unique. Re-appending the same id is a no-op, not an error. */
  id: string;
  /** ISO 8601 UTC timestamp. */
  timestamp: string;
  sessionId: string;
  character: string;
  /** e.g. "hear-tap" (this change's only modality); extensible for future arms. */
  modality: string;
  outcome: Outcome;
  latencyMs: number;
  /** 0-indexed position of this interaction within its session. */
  positionInSession: number;
  /** How many times this character was presented before this event, across all history. */
  priorExposureCount: number;
  /** Null if this is the character's first-ever exposure. */
  daysSinceLastExposure: number | null;
  /** Local wall-clock hour (0-23) at capture — distinct from `timestamp`, which is UTC and doesn't reveal local time-of-day across timezones/DST. */
  timeOfDay: number;
  adultPresent: boolean;
}

/** Fields required on every event, used by validation.ts. Kept as a
 * single source of truth so the "required fields" list can't drift
 * between the type and the validator. */
export const REQUIRED_EVENT_FIELDS: ReadonlyArray<keyof LearnerEvent> = [
  "id",
  "timestamp",
  "sessionId",
  "character",
  "modality",
  "outcome",
  "latencyMs",
  "positionInSession",
  "priorExposureCount",
  "daysSinceLastExposure",
  "timeOfDay",
  "adultPresent",
];
