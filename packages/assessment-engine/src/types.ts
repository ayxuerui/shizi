import type { LearnerEvent, MasteryState, Outcome } from "@shizi/learner-state";
import { DEFAULT_MASTERY_CONFIG } from "@shizi/learner-state";
import { DEFAULT_CALIBRATION_CONFIG, type CalibrationConfig } from "./calibration.js";
import { DEFAULT_DILUTION_CONFIG, type DilutionConfig } from "./dilution.js";
import type { GuessClassification, GuessDetectionConfig } from "./guess-detection.js";

export type ProbeKind = "informative" | "easy";

export interface ProbeItem {
  character: string;
  kind: ProbeKind;
  /** Full option set (target + distractors), already shuffled — see `distractors.ts`. */
  options: readonly string[];
}

export type NextProbeResult =
  | { status: "probe"; probe: ProbeItem }
  | { status: "session-complete"; reason: "duration" | "item-count" };

export interface RecordResponseInput {
  character: string;
  outcome: Outcome;
  latencyMs: number;
  adultPresent: boolean;
}

export interface RecordResponseResult {
  event: LearnerEvent;
  classification: GuessClassification;
  /** Recomputed from the full event log (including the just-appended event) — never a separately maintained copy. */
  masteryState: MasteryState;
}

export interface AssessmentSessionConfig {
  guessDetection: GuessDetectionConfig;
  dilution: DilutionConfig;
  calibration: CalibrationConfig;
  /** Bounded session length — `assessment` spec's "Bounded session length" requirement, default ~90s. */
  maxDurationMs: number;
  /** Backstop item-count bound alongside duration, in case items go unusually fast. */
  maxItems: number;
  /** Options presented per probe, including the target (design.md's "3-4 option layout"). */
  optionCount: number;
  /** Every Nth informative slot is reserved for an identity/shaky probe — `assessment` spec's "Identity and previously-flagged characters are probed too" scenario. */
  identityAndShakyEveryNInformativeSlots: number;
}

export const DEFAULT_ASSESSMENT_SESSION_CONFIG: AssessmentSessionConfig = {
  // Sourced from the SAME default as learner-state's mastery projection
  // — see guess-detection.ts's doc comment for why these must never
  // silently diverge.
  guessDetection: { fastThresholdMs: DEFAULT_MASTERY_CONFIG.guessDetectionThresholdMs },
  dilution: DEFAULT_DILUTION_CONFIG,
  calibration: DEFAULT_CALIBRATION_CONFIG,
  maxDurationMs: 90_000,
  maxItems: 30,
  optionCount: 4,
  identityAndShakyEveryNInformativeSlots: 3,
};

export interface SessionDeps {
  /** ISO 8601 UTC timestamp for events written during this session. */
  now: () => string;
  /** Milliseconds on a monotonic clock — used only for session-duration
   * bounding (task 8.10), never persisted. Real usage: `() => Date.now()`;
   * tests inject a scripted sequence for determinism. */
  elapsedMs: () => number;
  /** Local wall-clock hour (0-23) — distinct from `now()`, which is UTC
   * and doesn't reveal local time-of-day across timezones/DST (see
   * `learner-state`'s `LearnerEvent.timeOfDay` doc comment). */
  timeOfDay: () => number;
  /** [0, 1) uniform random source — every use of randomness in this
   * package goes through this, per this project's determinism discipline
   * (see `@shizi/adaptivity`'s `AssignmentDeps`). */
  random: () => number;
  /** Client-generated idempotency key for `LearnerEvent.id`. */
  newId: () => string;
}
