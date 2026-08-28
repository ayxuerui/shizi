import type { CandidatePool } from "@shizi/character-data";
import { buildConfusabilityIndex, computeConfusability } from "@shizi/character-data";
import { composeBatch, DEFAULT_CURRICULUM_CONFIG, type CurriculumConfig } from "@shizi/curriculum";
import { computeKnownSet, computeMasteryStates, type LearnerEvent } from "@shizi/learner-state";

/**
 * The three activities a complete per-batch cycle rotates through, kept
 * as a small pure function so it's independently testable from the UI
 * that acts on it. See the `learning-orchestration` spec
 * (`add-batch-scoped-activities`) for the full per-batch rotation
 * contract this implements — batch binding, learn-before-assess,
 * assess/memory scoping, and the determinism requirement.
 */
export type ActivityDecision =
  | { type: "learn"; characters: readonly string[] }
  | { type: "assess"; characters: readonly string[] }
  | { type: "memory"; characters: readonly string[] };

export interface ActivitySelectorConfig {
  curriculum: CurriculumConfig;
  /** Days since a `known` character's last event before it's "due" for a memory bout. */
  memoryDueAfterDays: number;
  /** Max characters presented in one memory bout — kept short, per this
   * project's "short bouts" ethos (`assessment` spec's "Bounded session
   * length" requirement), even though memory has no spec of its own. */
  maxMemoryItems: number;
}

export const DEFAULT_ACTIVITY_SELECTOR_CONFIG: ActivitySelectorConfig = {
  curriculum: DEFAULT_CURRICULUM_CONFIG,
  memoryDueAfterDays: 1,
  maxMemoryItems: 8,
};

export interface DecideActivityInput {
  pool: CandidatePool;
  /** This learner's full historical event log, across every module and activity. */
  events: readonly LearnerEvent[];
  /** Local calendar date, e.g. "2026-08-23" — injected, not read from the
   * clock directly, so this function stays a pure, deterministic
   * projection like the rest of this project's engines. */
  today: string;
  /** The local date a memory bout last ran, or null if none ever has. */
  lastMemoryBoutDate: string | null;
  config?: ActivitySelectorConfig;
}

/**
 * Best-effort reconstruction of "recently introduced" order from event
 * history: the character's FIRST-ever event timestamp stands in for when
 * it was introduced, across every module and activity (exposure or
 * assessment's own first-contact frontier probes both count as
 * "introducing" a character). Oldest-first seed, most-recent last, per
 * `CurriculumState.recentlyIntroduced`'s documented convention.
 */
export function deriveRecentlyIntroduced(events: readonly LearnerEvent[], windowSize: number): string[] {
  const firstSeenByCharacter = new Map<string, string>();
  for (const event of events) {
    const prev = firstSeenByCharacter.get(event.character);
    if (!prev || event.timestamp < prev) firstSeenByCharacter.set(event.character, event.timestamp);
  }
  return [...firstSeenByCharacter.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .slice(-windowSize)
    .map(([character]) => character);
}

/**
 * Characters eligible for a memory-review bout: `known`, outside the
 * active batch, whose most recent event is at least `thresholdDays`
 * old relative to `today`. Stalest-first, so a capped bout reviews the
 * characters most at risk of being forgotten first.
 */
export function computeDueForMemory(
  events: readonly LearnerEvent[],
  knownSet: ReadonlySet<string>,
  excludeCharacters: readonly string[],
  thresholdDays: number,
  today: string,
): string[] {
  const excluded = new Set(excludeCharacters);
  const lastEventByCharacter = new Map<string, string>();
  for (const event of events) {
    const prev = lastEventByCharacter.get(event.character);
    if (!prev || event.timestamp > prev) lastEventByCharacter.set(event.character, event.timestamp);
  }

  const todayNoonMs = Date.parse(`${today}T12:00:00.000Z`);
  const due: string[] = [];
  for (const character of knownSet) {
    if (excluded.has(character)) continue;
    const last = lastEventByCharacter.get(character);
    if (!last) continue;
    const daysSince = (todayNoonMs - Date.parse(last)) / 86_400_000;
    if (daysSince >= thresholdDays) due.push(character);
  }

  return due.sort((a, b) => {
    const aLast = lastEventByCharacter.get(a)!;
    const bLast = lastEventByCharacter.get(b)!;
    return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
  });
}

export function decideActivity(input: DecideActivityInput): ActivityDecision {
  const config = input.config ?? DEFAULT_ACTIVITY_SELECTOR_CONFIG;
  const masteryStates = computeMasteryStates(input.events);
  const knownSet = computeKnownSet(masteryStates);
  const confusabilityIndex = buildConfusabilityIndex(computeConfusability(input.pool));
  const recentlyIntroduced = deriveRecentlyIntroduced(input.events, config.curriculum.recentWindowSize);

  const batch = composeBatch(input.pool, { knownSet, recentlyIntroduced }, confusabilityIndex, config.curriculum);

  if (input.lastMemoryBoutDate !== input.today) {
    const due = computeDueForMemory(
      input.events,
      knownSet,
      batch.characters,
      config.memoryDueAfterDays,
      input.today,
    );
    if (due.length > 0) {
      return { type: "memory", characters: due.slice(0, config.maxMemoryItems) };
    }
  }

  // "Ever presented to the learner at all" — deliberately NOT
  // `masteryStates`, which only carries an entry for RECOGNITION-activity
  // events (see `learner-state`'s recognition-activity filter). An
  // exposure-only character (activities `listen`/`trace`) has
  // been introduced and must not be re-taught, even though it has no
  // mastery-projection entry at all yet.
  const everPresented = new Set(input.events.map((event) => event.character));
  const unintroduced = batch.characters.filter((character) => !everPresented.has(character));
  if (unintroduced.length > 0) return { type: "learn", characters: unintroduced };

  // Every batch member has been introduced (the branch above would have
  // fired otherwise), and `composeBatch` already excludes `known`/`shaky`
  // characters from ever entering `batch.characters` — so the batch's
  // full character list IS exactly its unresolved members; no further
  // filtering is needed. If the batch came back empty (pool exhaustion,
  // `batch.short` with nothing composed), `characters` is `[]`, which
  // `AssessmentSession` treats as "no focus" — an unfocused, whole-pool
  // bout, rather than a dead-ended session.
  return { type: "assess", characters: batch.characters };
}
