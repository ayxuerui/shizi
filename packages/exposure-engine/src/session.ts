import type { CandidatePool } from "@shizi/character-data";
import { buildConfusabilityIndex, computeConfusability, isUsable } from "@shizi/character-data";
import {
  assignPairToArms,
  AssignmentLog,
  findAssignmentForCharacter,
  findMatchedPairs,
  type Arm,
  type ArmAssignment,
} from "@shizi/adaptivity";
import { selectNextCharacter } from "@shizi/curriculum";
import {
  computeKnownSet,
  computeMasteryStates,
  EventLog,
  type LearnerActivity,
  type LearnerEvent,
} from "@shizi/learner-state";
import {
  DEFAULT_EXPOSURE_SESSION_CONFIG,
  type ExposureItem,
  type ExposureSessionConfig,
  type NextExposureItemResult,
  type RecordExposureCompletionInput,
  type RecordExposureCompletionResult,
  type SessionDeps,
} from "./types.js";

export interface CreateExposureSessionOptions {
  sessionId: string;
  pool: CandidatePool;
  /** This learner's full historical event log — used to compute the real
   * known-set (exposure never introduces an already-known character) and
   * `priorExposureCount`/`daysSinceLastExposure` continuity. */
  priorEvents?: readonly LearnerEvent[];
  /** This learner's full historical arm-assignment log — used to honor an
   * existing assignment rather than re-rolling one. */
  priorAssignments?: readonly ArmAssignment[];
  /** Characters introduced (by curriculum, any activity) before this
   * session started, most-recent-last — seeds the spacing constraint's
   * recent window. Best-effort: the caller derives this from event
   * history (see `apps/assessment`'s activity selector). */
  priorRecentlyIntroduced?: readonly string[];
  config?: ExposureSessionConfig;
  deps?: Partial<SessionDeps>;
}

/**
 * Orchestrates introducing not-yet-known characters: selection defers
 * entirely to `@shizi/curriculum` (per the `exposure` spec's "Character
 * selection defers to curriculum" requirement — this class defines no
 * ordering of its own), arm resolution honors or creates a matched-pair
 * assignment (moved here from `assessment-engine`, per
 * `add-tracing-modality-arm` design.md's "Arm assignment moves from probe
 * time to introduction time"), and every completed interaction is logged
 * as a non-recognition `LearnerEvent`.
 */
export class ExposureSession {
  readonly sessionId: string;

  private readonly pool: CandidatePool;
  private readonly config: ExposureSessionConfig;
  private readonly deps: SessionDeps;
  private readonly priorEvents: readonly LearnerEvent[];
  private readonly priorAssignments: readonly ArmAssignment[];
  private readonly priorRecentlyIntroduced: readonly string[];
  private readonly eventLog = new EventLog();
  private readonly assignmentLog = new AssignmentLog();
  private readonly confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>;

  /** Characters this session has already selected for introduction —
   * excluded from subsequent selection even though exposure never marks
   * anything "known" (see `nextItem`'s doc comment on why this is
   * needed). Provisional, session-local only; never written to
   * learner-state. */
  private readonly introducedThisSession: string[] = [];
  private itemsIssued = 0;
  private currentItem: ExposureItem | null = null;

  constructor(options: CreateExposureSessionOptions) {
    this.sessionId = options.sessionId;
    this.pool = options.pool;
    this.priorEvents = options.priorEvents ?? [];
    this.priorAssignments = options.priorAssignments ?? [];
    this.priorRecentlyIntroduced = options.priorRecentlyIntroduced ?? [];
    this.config = options.config ?? DEFAULT_EXPOSURE_SESSION_CONFIG;
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

  private allAssignments(): readonly ArmAssignment[] {
    return [...this.priorAssignments, ...this.assignmentLog.getAssignments()];
  }

  /**
   * Selects the next character to introduce via `curriculum`'s
   * `selectNextCharacter`, then resolves (honoring or creating) its arm
   * assignment.
   *
   * Exposure never writes a recognition event, so the real known-set
   * never changes as a direct result of calling this repeatedly within
   * one session — without `introducedThisSession` acting as a
   * provisional, session-local known-set addition, a second call would
   * deterministically re-select the SAME character. This mirrors
   * `@shizi/curriculum`'s own `composeBatch` carrying a simulated
   * known-set forward across picks.
   */
  nextItem(): NextExposureItemResult {
    const events = this.allEvents();
    const masteryStates = computeMasteryStates(events);
    const realKnownSet = computeKnownSet(masteryStates);
    const effectiveKnownSet = new Set([...realKnownSet, ...this.introducedThisSession]);
    const recentlyIntroduced = [...this.priorRecentlyIntroduced, ...this.introducedThisSession].slice(
      -this.config.curriculum.recentWindowSize,
    );

    const selection = selectNextCharacter(
      this.pool,
      { knownSet: effectiveKnownSet, recentlyIntroduced },
      this.confusabilityIndex,
      this.config.curriculum,
    );

    if (selection.status === "none-eligible") {
      return { status: "none-eligible", reason: selection.reason };
    }

    const character = selection.character;
    this.introducedThisSession.push(character);

    const arm = this.resolveArm(character, realKnownSet);
    this.currentItem = { character, arm };
    this.itemsIssued += 1;

    return { status: "item", item: { character, arm } };
  }

  /**
   * Per the `exposure` spec's "Arm-bound exposure delivery" requirement:
   * honors an existing assignment for this character if one exists
   * anywhere in history; otherwise finds this character's matched pair
   * among not-yet-known usable candidates and assigns+records both
   * members before returning. Falls back to a direct random pick (no
   * pair) only when no matched pair exists — still recorded, so every
   * introduced character has an assignment.
   */
  private resolveArm(character: string, knownSet: ReadonlySet<string>): Arm {
    const existing = findAssignmentForCharacter(this.allAssignments(), character);
    if (existing) return existing.arm;

    const notYetKnownUsable: string[] = [character];
    for (const [candidate, attributes] of this.pool) {
      if (candidate === character) continue;
      if (knownSet.has(candidate)) continue;
      if (!isUsable(attributes)) continue;
      notYetKnownUsable.push(candidate);
    }

    const pairs = findMatchedPairs(this.pool, notYetKnownUsable, this.confusabilityIndex, this.config.matchCriteria);
    const pair = pairs.find((p) => p.characters.includes(character));

    if (pair) {
      const assignments = assignPairToArms(pair, this.config.arms, {
        now: this.deps.now,
        random: this.deps.random,
      });
      this.assignmentLog.recordPair(assignments);
      return assignments.find((a) => a.character === character)!.arm;
    }

    // No matched pair available (e.g. no other not-yet-known usable
    // candidate exists right now) — still needs a real, recorded
    // assignment before delivery, per spec; a lone character can't go
    // through assignPairToArms's pair-shaped API, so assign directly
    // with the same injected randomness discipline.
    const arm = this.config.arms[Math.floor(this.deps.random() * this.config.arms.length)]!;
    this.assignmentLog.record({ character, arm, pairId: character, assignedAt: this.deps.now() });
    return arm;
  }

  /**
   * Records a completed exposure interaction as a full `LearnerEvent`,
   * per the `exposure` spec's "Exposure events are non-recognition"
   * requirement: `outcome` is always `"correct"` (guided tracing/tap-to-
   * continue interactions have no failure state to record — see the
   * spec's "No grading or failure state" requirement), and `modality` is
   * the arm actually delivered, which `learner-state`'s recognition-
   * modality filter structurally excludes from the mastery projection.
   */
  recordCompletion(input: RecordExposureCompletionInput): RecordExposureCompletionResult {
    if (this.currentItem === null) {
      throw new Error("recordCompletion called with no outstanding item — call nextItem first");
    }
    if (input.character !== this.currentItem.character) {
      throw new Error(
        `recordCompletion character "${input.character}" does not match the outstanding item "${this.currentItem.character}"`,
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
      module: "learn",
      // Arms ARE activity ids by construction (EXPOSURE_ARMS: "listen" | "trace").
      activity: this.currentItem.arm as LearnerActivity,
      outcome: "correct",
      latencyMs: input.latencyMs,
      positionInSession: this.itemsIssued - 1,
      priorExposureCount,
      daysSinceLastExposure,
      timeOfDay: this.deps.timeOfDay(),
      adultPresent: input.adultPresent,
    };

    const appendResult = this.eventLog.append(event);
    if (appendResult.status !== "appended") {
      throw new Error(`exposure-engine: failed to append event: ${JSON.stringify(appendResult)}`);
    }

    this.currentItem = null;
    return { event };
  }

  /** This session's events only (not prior history) — the caller flushes these to the durable event log. */
  getEvents(): readonly LearnerEvent[] {
    return this.eventLog.getEvents();
  }

  getAssignments(): readonly ArmAssignment[] {
    return this.assignmentLog.getAssignments();
  }
}
