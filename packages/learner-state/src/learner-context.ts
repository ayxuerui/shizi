import { computeKnownSet } from "./known-set-projection.js";
import {
  computeMasteryStates,
  DEFAULT_MASTERY_CONFIG,
  type MasteryProjectionConfig,
} from "./mastery-projection.js";
import type { LearnerEvent, MasteryState } from "./types.js";

/**
 * The outward-facing read model other layers consume to answer "what does
 * this learner know?" — per the `learner-state` spec's "Learner context is
 * the outward contract for other layers" requirement. Consumers obtain their
 * progress facts from here rather than re-deriving mastery, known-set
 * membership, or recency from raw events.
 *
 * It is a pure projection over the event log: computed fresh on every call,
 * never persisted as independently-editable state.
 */
export interface LearnerContext {
  /**
   * Mastery state per unit, derived from recognition-activity events only
   * (`computeMasteryStates`). A unit taught only via exposure has no entry
   * here at all — "presented" and "measured" are different facts over
   * different event subsets and must not be conflated.
   */
  readonly masteryStates: ReadonlyMap<string, MasteryState>;
  /**
   * Units currently known or shaky — what new content is allowed to build
   * on. Derived from `masteryStates`, so it inherits the same
   * recognition-only evidence rule.
   */
  readonly knownSet: ReadonlySet<string>;
  /**
   * Every unit that has ever appeared in ANY event, of any activity. An exposure-only unit is presented even though it has no
   * mastery entry — this set, not `masteryStates`' keys, answers "has the
   * learner ever seen this?"
   */
  readonly everPresented: ReadonlySet<string>;
  /**
   * Each presented unit's most recent event timestamp (ISO 8601), across
   * every activity — how long ago a unit was last seen.
   */
  readonly lastExposureByUnit: ReadonlyMap<string, string>;
  /**
   * All presented units ordered by first-ever appearance in the log, oldest
   * first — the order in which units were introduced. The full ordering;
   * consumers wanting a recent window slice its tail.
   */
  readonly introductionOrder: readonly string[];
}

/**
 * Projects the full learner context out of the event log in one pass.
 * Pure function of `(events, config)` — same log and config, same facts —
 * so it works offline with no network and no clock access.
 */
export function deriveLearnerContext(
  events: readonly LearnerEvent[],
  config: MasteryProjectionConfig = DEFAULT_MASTERY_CONFIG,
): LearnerContext {
  const masteryStates = computeMasteryStates(events, config);
  const knownSet = computeKnownSet(masteryStates);

  const firstExposureByUnit = new Map<string, string>();
  const lastExposureByUnit = new Map<string, string>();
  for (const event of events) {
    const unit = event.character;
    const prevFirst = firstExposureByUnit.get(unit);
    if (prevFirst === undefined || Date.parse(event.timestamp) < Date.parse(prevFirst)) {
      firstExposureByUnit.set(unit, event.timestamp);
    }
    const prevLast = lastExposureByUnit.get(unit);
    if (prevLast === undefined || Date.parse(event.timestamp) > Date.parse(prevLast)) {
      lastExposureByUnit.set(unit, event.timestamp);
    }
  }

  // Stable sort keeps equal-timestamp units in first-appearance (log) order.
  const introductionOrder = [...firstExposureByUnit.entries()]
    .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]))
    .map(([unit]) => unit);

  return {
    masteryStates,
    knownSet,
    everPresented: new Set(firstExposureByUnit.keys()),
    lastExposureByUnit,
    introductionOrder,
  };
}
