import type { Arm, MatchCriteria } from "@shizi/adaptivity";
import { DEFAULT_MATCH_CRITERIA } from "@shizi/adaptivity";
import type { CurriculumConfig } from "@shizi/curriculum";
import { DEFAULT_CURRICULUM_CONFIG } from "@shizi/curriculum";
import type { LearnerEvent } from "@shizi/learner-state";

/**
 * The exposure module's two teaching activities — see `exposure` spec's
 * "Arm-bound exposure delivery" requirement. Neither is in
 * `learner-state`'s recognition-activity set (`hear-tap` only), so the
 * known/shaky projection structurally excludes them — see
 * `mastery-projection.ts`.
 */
export const EXPOSURE_ARMS: readonly Arm[] = ["listen", "trace"];

export interface ExposureItem {
  character: string;
  arm: Arm;
}

export type NextExposureItemResult =
  | { status: "item"; item: ExposureItem }
  | { status: "none-eligible"; reason: string };

export interface RecordExposureCompletionInput {
  character: string;
  latencyMs: number;
  adultPresent: boolean;
}

export interface RecordExposureCompletionResult {
  event: LearnerEvent;
}

export interface ExposureSessionConfig {
  arms: readonly Arm[];
  matchCriteria: MatchCriteria;
  curriculum: CurriculumConfig;
}

export const DEFAULT_EXPOSURE_SESSION_CONFIG: ExposureSessionConfig = {
  arms: EXPOSURE_ARMS,
  matchCriteria: DEFAULT_MATCH_CRITERIA,
  curriculum: DEFAULT_CURRICULUM_CONFIG,
};

export interface SessionDeps {
  /** ISO 8601 UTC timestamp for events/assignments written during this session. */
  now: () => string;
  /** Local wall-clock hour (0-23) — see `learner-state`'s `LearnerEvent.timeOfDay` doc comment. */
  timeOfDay: () => number;
  /** [0, 1) uniform random source — every use of randomness in this package goes through this. */
  random: () => number;
  /** Client-generated idempotency key for `LearnerEvent.id`. */
  newId: () => string;
}
