import type { CandidatePool } from "@shizi/character-data";
import { buildConfusabilityIndex, computeConfusability } from "@shizi/character-data";
import { composeBatch, DEFAULT_CURRICULUM_CONFIG, type CurriculumConfig } from "@shizi/curriculum";
import { computeKnownSet, computeMasteryStates, type LearnerEvent } from "@shizi/learner-state";

/**
 * The three activities a complete per-batch cycle rotates through — no
 * spec names this orchestration yet (this project has specs for `learn`
 * (`exposure`), `assessment`, and per-character mastery, but nothing that
 * decides WHEN to run which one for a given batch). This is that
 * decision, kept as a small pure function so it's independently testable
 * from the UI that acts on it.
 *
 * - `learn`: the active batch has a character nobody has ever presented
 *   to the learner yet (in ANY modality/activity) — teach it via
 *   `exposure-engine`.
 * - `assess`: every active-batch character has been introduced at least
 *   once but isn't yet `known`/`shaky` — run a normal (full-pool)
 *   assessment bout. Deliberately NOT scoped to just the batch's
 *   characters: `AssessmentSession`'s easy-item dilution draws from the
 *   learner's ENTIRE known-set (see its own doc comment), and its
 *   distractor generator looks up attributes for whatever character that
 *   draws by indexing the SAME pool passed to the session — restricting
 *   that pool to 5 characters would break distractor lookups for
 *   already-known characters from earlier batches. Frontier search
 *   across the full pool naturally gravitates toward the batch's
 *   not-yet-known characters anyway, since curriculum and frontier
 *   search both rank by the same underlying difficulty signal.
 * - `memory`: at least one `known` character outside the active batch
 *   hasn't been touched in `memoryDueAfterDays`, and no memory bout has
 *   run yet today — a lightweight spaced-repetition review, run once per
 *   day ahead of new-content work.
 */
export type ActivityDecision =
  | { type: "learn"; characters: readonly string[] }
  | { type: "assess" }
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
  /** This learner's full historical event log, across every activity/modality. */
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
 * it was introduced, across every activity/modality (exposure or
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
  // `masteryStates`, which only carries an entry for RECOGNITION-modality
  // events (see `learner-state`'s recognition-modality filter). An
  // exposure-only character (modality `expose-listen`/`expose-trace`) has
  // been introduced and must not be re-taught, even though it has no
  // mastery-projection entry at all yet.
  const everPresented = new Set(input.events.map((event) => event.character));
  const unintroduced = batch.characters.filter((character) => !everPresented.has(character));
  if (unintroduced.length > 0) return { type: "learn", characters: unintroduced };

  return { type: "assess" };
}
