/**
 * The fixed, hand-authored Phase A sequence — 25 characters, used by the
 * curriculum sequencer until exhausted, per `curriculum` spec's "Fixed
 * Phase A sequence precedes scoring" requirement. Scoring-based selection
 * (Phase B) cannot bootstrap from an empty known-set, so this order is
 * decided by hand rather than computed.
 *
 * Composition (see design.md "Sequencer bootstrap: fixed Phase A, then
 * greedy Phase B"):
 *   - a minimal grammar skeleton (pronouns, common verbs, basic
 *     adjectives, directionals, particles) so real sentences are possible
 *     as early as possible — a heritage speaker already has these words
 *     spoken; this is purely the form-recognition side
 *   - a handful of concrete, pictographic characters for early
 *     engagement and visual variety
 *
 * Order within the list is the teaching order, not arbitrary.
 * Deliberately excludes every identity-set character (薛亦霖小蓝莓) —
 * those are logos she already owns, not curriculum targets (see
 * `identity-set.ts` and the `character-data` spec).
 */
export const PHASE_A_SEQUENCE: readonly string[] = [
  // Grammar skeleton (20)
  "我", "你", "他", "是", "有", "不", "在", "了", "的", "看",
  "去", "来", "走", "好", "大", "上", "下", "一", "个", "也",
  // Concrete pictographs (5)
  "山", "水", "火", "日", "木",
];

if (PHASE_A_SEQUENCE.length !== 25) {
  throw new Error(
    `PHASE_A_SEQUENCE must have exactly 25 characters, has ${PHASE_A_SEQUENCE.length}`,
  );
}
