import type { LearnerEvent, MasteryState } from "./types.js";

/**
 * Modalities whose outcomes count as evidence of character *recognition*.
 * Owned here (not by whichever engine happens to write the event) so the
 * exclusion is structural — see `add-tracing-modality-arm` design.md's
 * "Exposure events use non-recognition modality identifiers" decision.
 * `hear-tap` is the assessment's existing (and, until this change, only)
 * modality; `expose-listen`/`expose-trace` are teaching interactions, not
 * recognition checks, and must never promote a character to `known`.
 */
export const DEFAULT_RECOGNITION_MODALITIES: ReadonlySet<string> = new Set(["hear-tap"]);

export interface MasteryProjectionConfig {
  /** Below this latency, a correct response counts as a genuine (non-guess) hit. */
  guessDetectionThresholdMs: number;
  /** Only events whose `modality` is in this set count toward the
   * consecutive-correct/miss streak. Defaults to `DEFAULT_RECOGNITION_MODALITIES`. */
  recognitionModalities?: ReadonlySet<string>;
}

export const DEFAULT_MASTERY_CONFIG: MasteryProjectionConfig = {
  // See design.md "Guess detection thresholds" — ~2000ms "fast" default,
  // tunable per-learner. This module takes it as a parameter rather than
  // hard-coding it, since design.md explicitly expects it to be tuned
  // after observing real sessions.
  guessDetectionThresholdMs: 2000,
  recognitionModalities: DEFAULT_RECOGNITION_MODALITIES,
};

/**
 * Computes mastery state per character from the full event history, per
 * `learner-state` spec's "Known-set and mastery projection" requirement.
 * Pure function of the event log — the whole point of the append-only
 * design (design.md: "Projection recomputed after model change") is that
 * this can be re-run from scratch with different logic at any time
 * without re-collecting data.
 *
 * Interpretation decision (spec doesn't say explicitly): a slow-but-
 * correct response breaks the consecutive-fast-correct streak just like
 * a miss would — "two CONSECUTIVE correct fast responses" is read
 * literally, so anything that doesn't qualify interrupts the count,
 * whether it's wrong or just slow.
 */
export function computeMasteryStates(
  events: readonly LearnerEvent[],
  config: MasteryProjectionConfig = DEFAULT_MASTERY_CONFIG,
): Map<string, MasteryState> {
  const recognitionModalities = config.recognitionModalities ?? DEFAULT_RECOGNITION_MODALITIES;
  const recognitionEvents = events.filter((event) => recognitionModalities.has(event.modality));

  const byCharacter = new Map<string, LearnerEvent[]>();
  for (const event of recognitionEvents) {
    if (!byCharacter.has(event.character)) {
      byCharacter.set(event.character, []);
    }
    byCharacter.get(event.character)!.push(event);
  }

  const states = new Map<string, MasteryState>();

  for (const [character, characterEvents] of byCharacter) {
    const ordered = [...characterEvents].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
    );

    let state: MasteryState = "probing";
    let consecutiveFastCorrect = 0;

    for (const event of ordered) {
      const isFastCorrect =
        event.outcome === "correct" && event.latencyMs < config.guessDetectionThresholdMs;

      if (isFastCorrect) {
        consecutiveFastCorrect += 1;
        if (consecutiveFastCorrect >= 2) {
          state = "known";
        }
      } else {
        // Either a miss, or a slow correct response — both interrupt the
        // streak. Only demote to "shaky" if the character was already
        // "known"; while still "probing", there's nothing to demote from.
        consecutiveFastCorrect = 0;
        if (state === "known") {
          state = "shaky";
        }
      }
    }

    states.set(character, state);
  }

  return states;
}
