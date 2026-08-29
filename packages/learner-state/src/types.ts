/**
 * Outcome of a single character-recognition interaction. This schema is
 * specifically for character-interaction events (assessment probes,
 * exposure teaching interactions, review responses) — not a
 * general-purpose event bus.
 */
export type Outcome = "correct" | "incorrect";

export type MasteryState = "unseen" | "probing" | "known" | "shaky";

/**
 * The module that produced an event — the rotating pedagogical unit
 * (see `add-activity-mode-indicator` design decision 1 for the
 * module/activity vocabulary).
 */
export type LearnerModule = "learn" | "assess" | "review";

/**
 * The concrete interaction the learner performed within a module.
 * `listen`/`trace` are teaching activities (they never promote mastery);
 * `hear-tap` is recognition evidence.
 */
export type LearnerActivity = "listen" | "trace" | "hear-tap";

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
  /** The module that produced this event. */
  module: LearnerModule;
  /** The interaction the learner performed, e.g. "hear-tap". */
  activity: LearnerActivity;
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
  "module",
  "activity",
  "outcome",
  "latencyMs",
  "positionInSession",
  "priorExposureCount",
  "daysSinceLastExposure",
  "timeOfDay",
  "adultPresent",
];
