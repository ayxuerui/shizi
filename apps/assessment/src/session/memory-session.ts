import type { CandidatePool } from "@shizi/character-data";
import { buildConfusabilityIndex, computeConfusability } from "@shizi/character-data";
import { pickDistractors, shuffled } from "@shizi/assessment-engine";
import { EventLog, type LearnerEvent, type Outcome } from "@shizi/learner-state";

/** No spec names this activity yet — see `session/activity-selector.ts`'s
 * doc comment for why. Reuses `hear-tap`, the assessment's own
 * recognition modality: a memory-review probe genuinely IS a recognition
 * check (same interaction, same guess-detection semantics), just applied
 * to a caller-supplied due-list instead of frontier search. A miss here
 * demotes the character to `shaky` through the exact same mastery
 * projection assessment already uses — the intended signal, not a
 * side-effect to work around. */
const MODALITY = "hear-tap";

export interface MemoryProbeItem {
  character: string;
  options: readonly string[];
}

export type NextMemoryProbeResult =
  | { status: "probe"; probe: MemoryProbeItem }
  | { status: "session-complete" };

export interface RecordMemoryResponseInput {
  character: string;
  outcome: Outcome;
  latencyMs: number;
  adultPresent: boolean;
}

export interface RecordMemoryResponseResult {
  event: LearnerEvent;
}

export interface MemorySessionConfig {
  optionCount: number;
  /** Fixed mid-level confusability for distractors — memory review isn't
   * calibrating anything (that's Loop 4, `assessment`'s own concern); a
   * constant, moderate level keeps options plausible without re-deriving
   * a rolling-accuracy signal for a short, already-capped bout. */
  confusabilityLevel: number;
}

export const DEFAULT_MEMORY_SESSION_CONFIG: MemorySessionConfig = {
  optionCount: 4,
  confusabilityLevel: 0.5,
};

export interface MemorySessionDeps {
  now: () => string;
  timeOfDay: () => number;
  random: () => number;
  newId: () => string;
}

export interface CreateMemorySessionOptions {
  sessionId: string;
  pool: CandidatePool;
  /** Characters to review, in presentation order — the caller (this
   * app's activity selector) has already picked and ordered these
   * (stalest-first, capped) via `computeDueForMemory`. This class does
   * not re-derive or re-order them; it only presents and logs. */
  dueCharacters: readonly string[];
  priorEvents?: readonly LearnerEvent[];
  config?: MemorySessionConfig;
  deps?: Partial<MemorySessionDeps>;
}

/**
 * A short spaced-repetition review bout over an already-known, already-
 * chosen set of characters. Deliberately not built on `AssessmentSession`:
 * that engine's felt-difficulty dilution draws its "easy" pool from the
 * learner's ENTIRE known-set, with no way to restrict it to a specific
 * due-list — reusing it here would either review the wrong characters or
 * require reshaping a well-tested, spec'd engine for a capability the
 * spec doesn't cover. This is intentionally the smaller, purpose-built
 * alternative.
 */
export class MemorySession {
  readonly sessionId: string;

  private readonly pool: CandidatePool;
  private readonly dueCharacters: readonly string[];
  private readonly config: MemorySessionConfig;
  private readonly deps: MemorySessionDeps;
  private readonly priorEvents: readonly LearnerEvent[];
  private readonly eventLog = new EventLog();
  private readonly confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>;

  private cursor = 0;
  private currentCharacter: string | null = null;

  constructor(options: CreateMemorySessionOptions) {
    this.sessionId = options.sessionId;
    this.pool = options.pool;
    this.dueCharacters = options.dueCharacters;
    this.priorEvents = options.priorEvents ?? [];
    this.config = options.config ?? DEFAULT_MEMORY_SESSION_CONFIG;
    this.deps = {
      now: options.deps?.now ?? (() => new Date().toISOString()),
      timeOfDay: options.deps?.timeOfDay ?? (() => new Date().getHours()),
      random: options.deps?.random ?? Math.random,
      newId: options.deps?.newId ?? (() => crypto.randomUUID()),
    };
    this.confusabilityIndex = buildConfusabilityIndex(computeConfusability(this.pool));
  }

  private allEvents(): readonly LearnerEvent[] {
    return [...this.priorEvents, ...this.eventLog.getEvents()];
  }

  nextProbe(): NextMemoryProbeResult {
    if (this.cursor >= this.dueCharacters.length) {
      return { status: "session-complete" };
    }

    const character = this.dueCharacters[this.cursor]!;
    const distractorCount = Math.max(0, this.config.optionCount - 1);
    const distractors = pickDistractors(
      character,
      this.pool,
      this.confusabilityIndex,
      this.config.confusabilityLevel,
      distractorCount,
      { random: this.deps.random },
    );
    const options = shuffled([character, ...distractors], this.deps.random);

    this.currentCharacter = character;
    return { status: "probe", probe: { character, options } };
  }

  recordResponse(input: RecordMemoryResponseInput): RecordMemoryResponseResult {
    if (this.currentCharacter === null) {
      throw new Error("recordResponse called with no outstanding probe — call nextProbe first");
    }
    if (input.character !== this.currentCharacter) {
      throw new Error(
        `recordResponse character "${input.character}" does not match the outstanding probe "${this.currentCharacter}"`,
      );
    }

    const priorEventsForCharacter = this.allEvents().filter((event) => event.character === input.character);
    const priorExposureCount = priorEventsForCharacter.length;
    const lastExposureTimestamp = priorEventsForCharacter.reduce<string | null>(
      (latest, event) => (latest === null || event.timestamp > latest ? event.timestamp : latest),
      null,
    );

    const now = this.deps.now();
    const daysSinceLastExposure =
      lastExposureTimestamp === null ? null : (Date.parse(now) - Date.parse(lastExposureTimestamp)) / 86_400_000;

    const event: LearnerEvent = {
      id: this.deps.newId(),
      timestamp: now,
      sessionId: this.sessionId,
      character: input.character,
      modality: MODALITY,
      outcome: input.outcome,
      latencyMs: input.latencyMs,
      positionInSession: this.cursor,
      priorExposureCount,
      daysSinceLastExposure,
      timeOfDay: this.deps.timeOfDay(),
      adultPresent: input.adultPresent,
    };

    const appendResult = this.eventLog.append(event);
    if (appendResult.status !== "appended") {
      throw new Error(`memory-session: failed to append event: ${JSON.stringify(appendResult)}`);
    }

    this.cursor += 1;
    this.currentCharacter = null;

    return { event };
  }

  getEvents(): readonly LearnerEvent[] {
    return this.eventLog.getEvents();
  }
}
