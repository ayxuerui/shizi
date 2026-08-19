/**
 * Per `assessment` spec's "No visible scoring or failure state"
 * requirement: this union has NO "error"/"wrong"/"miss" member. That's
 * the enforcement mechanism, not just a naming choice — adding a red
 * "you got it wrong" treatment means adding a new member to this
 * shared, reviewed type (and explaining why), not dropping a class name
 * into a component.
 *
 * `redirect` IS what an incorrect response looks like: a neutral cue,
 * per the spec's "neutral or gentle redirect" wording — never a
 * distinct "you got it wrong" signal. `advance` is the beat-transition
 * cue played whenever the narrative moves forward (see
 * `use-interaction-sound.ts`), independent of whether the response that
 * triggered it was correct.
 */
export type CueKind = "acknowledge" | "redirect" | "advance";

export function cueForOutcome(correct: boolean): "acknowledge" | "redirect" {
  return correct ? "acknowledge" : "redirect";
}
