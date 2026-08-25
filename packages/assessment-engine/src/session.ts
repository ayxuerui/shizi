import type { CandidatePool } from "@shizi/character-data";
import { buildConfusabilityIndex, computeConfusability, IDENTITY_CHARACTERS } from "@shizi/character-data";
import {
  computeKnownSet,
  computeMasteryStates,
  EventLog,
  type LearnerEvent,
  type Outcome,
} from "@shizi/learner-state";
import { computeRollingAccuracy, nextConfusabilityLevel } from "./calibration.js";
import { computeDifficultyIndex } from "./difficulty.js";
import { isInformativeSlot, pickEasyItem } from "./dilution.js";
import { pickDistractors, shuffled } from "./distractors.js";
import { buildFrontierCandidates, computeFrontierBounds, selectNextFrontierProbe } from "./frontier.js";
import { classifyResponse } from "./guess-detection.js";
import {
  DEFAULT_ASSESSMENT_SESSION_CONFIG,
  type AssessmentSessionConfig,
  type NextProbeResult,
  type ProbeKind,
  type RecordResponseInput,
  type RecordResponseResult,
  type SessionDeps,
} from "./types.js";

const MODULE = "assess";
const ACTIVITY = "hear-tap"; // the recognition activity — see adaptivity-instrumentation spec.

export interface CreateAssessmentSessionOptions {
  sessionId: string;
  pool: CandidatePool;
  /** This learner's full historical event log (all prior sessions) — used to seed the frontier bracket and compute prior-exposure/days-since-last-exposure. Empty for a brand-new learner. */
  priorEvents?: readonly LearnerEvent[];
  config?: AssessmentSessionConfig;
  deps?: Partial<SessionDeps>;
}

/**
 * Orchestrates one assessment bout end-to-end: adaptive frontier-search
 * probe selection (8.4), guess-detection-aware event emission (8.5, 8.12),
 * felt-difficulty dilution (8.6), Loop 4 difficulty calibration (8.7),
 * session bounding (8.10).
 *
 * Matched-pair arm assignment (originally 8.13) no longer happens here —
 * `add-tracing-modality-arm` design.md's "Arm assignment moves from probe
 * time to introduction time" moved it to `@shizi/exposure-engine`, since
 * frontier search here often probes a character that turns out to
 * already be known and is never introduced through exposure at all.
 *
 * Deterministic given the same `priorEvents`, `config`, and `deps` —
 * every source of randomness or wall-clock time is injected, never read
 * directly (see `SessionDeps`).
 */
export class AssessmentSession {
  readonly sessionId: string;

  private readonly pool: CandidatePool;
  private readonly config: AssessmentSessionConfig;
  private readonly deps: SessionDeps;
  private readonly priorEvents: readonly LearnerEvent[];
  private readonly eventLog = new EventLog();
  private readonly difficultyIndex: ReadonlyMap<string, number>;
  private readonly confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>;
  private readonly startElapsedMs: number;

  private probesIssued = 0;
  private informativeSlotsServed = 0;
  private easyPoolCursor = 0;
  private identityAndShakyCursor = 0;
  private rollingOutcomes: Outcome[] = [];
  private confusabilityLevel = 0.5;
  private currentProbe: { character: string; kind: ProbeKind } | null = null;

  constructor(options: CreateAssessmentSessionOptions) {
    this.sessionId = options.sessionId;
    this.pool = options.pool;
    this.priorEvents = options.priorEvents ?? [];
    this.config = options.config ?? DEFAULT_ASSESSMENT_SESSION_CONFIG;
    // Same lazy-default idiom as @shizi/adaptivity's AssignmentDeps: real
    // usage gets real wall-clock/randomness by default, tests override
    // every field for full determinism.
    this.deps = {
      now: options.deps?.now ?? (() => new Date().toISOString()),
      elapsedMs: options.deps?.elapsedMs ?? (() => Date.now()),
      timeOfDay: options.deps?.timeOfDay ?? (() => new Date().getHours()),
      random: options.deps?.random ?? Math.random,
      newId: options.deps?.newId ?? (() => crypto.randomUUID()),
    };
    this.difficultyIndex = computeDifficultyIndex(this.pool);
    this.confusabilityIndex = buildConfusabilityIndex(computeConfusability(this.pool));
    this.startElapsedMs = this.deps.elapsedMs();
  }

  private allEvents(): readonly LearnerEvent[] {
    return [...this.priorEvents, ...this.eventLog.getEvents()];
  }

  /**
   * Selects and returns the next probe, or signals the bout is complete.
   * Per `assessment` spec's "Bounded session length" requirement: checked
   * before any selection work, so a session never issues a probe past
   * its bound.
   */
  nextProbe(): NextProbeResult {
    if (this.deps.elapsedMs() - this.startElapsedMs >= this.config.maxDurationMs) {
      return { status: "session-complete", reason: "duration" };
    }
    if (this.probesIssued >= this.config.maxItems) {
      return { status: "session-complete", reason: "item-count" };
    }

    const events = this.allEvents();
    const masteryStates = computeMasteryStates(events, {
      guessDetectionThresholdMs: this.config.guessDetection.fastThresholdMs,
    });
    const knownSet = computeKnownSet(masteryStates);
    const shakyCharacters = [...masteryStates.entries()]
      .filter(([, state]) => state === "shaky")
      .map(([character]) => character);
    const identityAndShakyPool = [...new Set([...IDENTITY_CHARACTERS, ...shakyCharacters])];

    const slotIndex = this.probesIssued;
    let character: string | null = null;

    if (!isInformativeSlot(slotIndex, this.config.dilution)) {
      const easyPool = [...new Set([...IDENTITY_CHARACTERS, ...knownSet])];
      character = pickEasyItem(easyPool, this.easyPoolCursor);
      if (character !== null) this.easyPoolCursor += 1;
    }

    const kind: ProbeKind = character !== null ? "easy" : "informative";

    if (character === null) {
      const forceIdentityOrShaky =
        identityAndShakyPool.length > 0 &&
        this.informativeSlotsServed % this.config.identityAndShakyEveryNInformativeSlots === 0;

      if (forceIdentityOrShaky) {
        character = identityAndShakyPool[this.identityAndShakyCursor % identityAndShakyPool.length]!;
        this.identityAndShakyCursor += 1;
      } else {
        const candidates = buildFrontierCandidates(this.pool, knownSet, this.difficultyIndex);
        const bounds = computeFrontierBounds(events, knownSet, this.difficultyIndex);
        const picked = selectNextFrontierProbe(candidates, bounds, this.informativeSlotsServed);
        if (picked) {
          character = picked.character;
        } else if (identityAndShakyPool.length > 0) {
          // Frontier genuinely exhausted (every usable candidate is
          // known) — fall back to identity/shaky rotation rather than
          // dead-ending the session.
          character = identityAndShakyPool[this.identityAndShakyCursor % identityAndShakyPool.length]!;
          this.identityAndShakyCursor += 1;
        }
      }
      this.informativeSlotsServed += 1;
    }

    if (character === null) {
      // Nothing at all left to probe — never happens in practice (the
      // identity set alone is never empty), but handled explicitly
      // rather than left to crash.
      return { status: "session-complete", reason: "item-count" };
    }

    const distractorCount = Math.max(0, this.config.optionCount - 1);
    const distractors = pickDistractors(
      character,
      this.pool,
      this.confusabilityIndex,
      this.confusabilityLevel,
      distractorCount,
      { random: this.deps.random },
    );
    const options = shuffled([character, ...distractors], this.deps.random);

    this.currentProbe = { character, kind };
    this.probesIssued += 1;

    return { status: "probe", probe: { character, kind, options } };
  }

  /**
   * Records the learner's response to the outstanding probe: builds and
   * appends a full `LearnerEvent` (task 8.12 — every required field
   * populated, including the three with no current consumer), updates
   * Loop 4 calibration, and returns the recomputed mastery state.
   */
  recordResponse(input: RecordResponseInput): RecordResponseResult {
    if (this.currentProbe === null) {
      throw new Error("recordResponse called with no outstanding probe — call nextProbe first");
    }
    if (input.character !== this.currentProbe.character) {
      throw new Error(
        `recordResponse character "${input.character}" does not match the outstanding probe "${this.currentProbe.character}"`,
      );
    }

    const classification = classifyResponse(input.outcome, input.latencyMs, this.config.guessDetection);

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
      module: MODULE,
      activity: ACTIVITY,
      outcome: input.outcome,
      latencyMs: input.latencyMs,
      positionInSession: this.probesIssued - 1,
      priorExposureCount,
      daysSinceLastExposure,
      timeOfDay: this.deps.timeOfDay(),
      adultPresent: input.adultPresent,
    };

    const appendResult = this.eventLog.append(event);
    if (appendResult.status !== "appended") {
      // An engine-internal invariant violation (e.g. a colliding
      // generated id, or a malformed event this module itself built) —
      // not an expected caller-input error, so this throws rather than
      // returning a result the caller would need to check.
      throw new Error(`assessment-engine: failed to append event: ${JSON.stringify(appendResult)}`);
    }

    this.rollingOutcomes.push(input.outcome);
    if (this.rollingOutcomes.length > this.config.calibration.rollingWindowSize) {
      this.rollingOutcomes.shift();
    }
    const rollingAccuracy = computeRollingAccuracy(this.rollingOutcomes, this.config.calibration);
    this.confusabilityLevel = nextConfusabilityLevel(this.confusabilityLevel, rollingAccuracy, this.config.calibration);

    // Per `assessment` spec's "Assessment results feed learner state"
    // requirement: no separate/disconnected record — the mastery state
    // is recomputed from the log this call just appended to, not cached.
    const masteryState =
      computeMasteryStates(this.allEvents(), {
        guessDetectionThresholdMs: this.config.guessDetection.fastThresholdMs,
      }).get(input.character) ?? "unseen";

    this.currentProbe = null;

    return { event, classification, masteryState };
  }

  /** This session's events only (not prior history) — the caller flushes these to the durable event log. */
  getEvents(): readonly LearnerEvent[] {
    return this.eventLog.getEvents();
  }
}
