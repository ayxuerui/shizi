import { useEffect, useReducer, useRef } from "react";
import {
  AssessmentSession,
  type AssessmentSessionConfig,
  type NextProbeResult,
  type SessionDeps,
} from "@shizi/assessment-engine";
import type { CandidatePool } from "@shizi/character-data";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment, Rating, SessionRating } from "@shizi/adaptivity";
import { enqueueAssignments, enqueueEvent, enqueueRating, loadPriorEvents } from "../offline/event-queue.js";
import { flushQueue } from "../offline/sync.js";
import { boutReducer, INITIAL_BOUT_STATE, type BoutState } from "./bout-machine.js";

/** After a response, how long the (already-neutral) cue is visible
 * before the narrative moves on to the next beat — long enough to
 * register, per the "positive closing beat"/"neutral redirect" spirit,
 * short enough that a 60-90s bout can fit its item count. */
const RESOLVE_DELAY_MS = 700;

async function defaultOnEvent(event: LearnerEvent): Promise<void> {
  await enqueueEvent(event);
  void flushQueue(); // fire-and-forget — a sync failure must never block or surface to the child.
}

async function defaultOnAssignments(assignments: readonly ArmAssignment[]): Promise<void> {
  await enqueueAssignments(assignments);
}

async function defaultOnRating(rating: SessionRating): Promise<void> {
  await enqueueRating(rating);
  void flushQueue(); // fire-and-forget, same discipline as defaultOnEvent.
}

export interface UseAssessmentSessionOptions {
  sessionId: string;
  pool: CandidatePool;
  config?: AssessmentSessionConfig;
  deps?: Partial<SessionDeps>;
  /** Defaults to loading this device's local history from the offline
   * queue; tests inject a scripted array directly. */
  loadPriorEvents?: () => Promise<readonly LearnerEvent[]>;
  /** Clock for latency measurement — defaults to `performance.now()`; tests inject a scripted sequence. */
  nowMs?: () => number;
  onEvent?: (event: LearnerEvent) => void | Promise<void>;
  onAssignments?: (assignments: readonly ArmAssignment[]) => void | Promise<void>;
  onRating?: (rating: SessionRating) => void | Promise<void>;
}

export interface UseAssessmentSessionResult {
  state: BoutState;
  submitResponse: (selected: string) => void;
  rate: (rating: Rating) => void;
  skipRating: () => void;
}

/**
 * The composition seam between `AssessmentSession` (the headless engine,
 * Pass 1) and this app's UI. Builds exactly ONE `AssessmentSession` per
 * mount via a `useRef` guard — not a `useState` initializer, which React
 * 18 StrictMode double-invokes and would build two engines with two
 * independent `AssignmentLog`s (see `initializedRef` below).
 *
 * `classification`/`masteryState` from `recordResponse` are read and
 * immediately discarded here — they never enter `BoutState`, which is
 * the structural guarantee that guess detection stays invisible to the
 * UI layer (per the spec's silent two-hit-confirmation requirement).
 */
export function useAssessmentSession(options: UseAssessmentSessionOptions): UseAssessmentSessionResult {
  const {
    sessionId,
    pool,
    config,
    deps,
    loadPriorEvents: loadPriorEventsImpl = loadPriorEvents,
    nowMs = () => performance.now(),
    onEvent = defaultOnEvent,
    onAssignments = defaultOnAssignments,
    onRating = defaultOnRating,
  } = options;

  const [state, dispatch] = useReducer(boutReducer, INITIAL_BOUT_STATE);
  const sessionRef = useRef<AssessmentSession | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A component that unmounts mid-"resolving" must not fire its pending
  // next-probe dispatch afterward — an uncancelled timer here would leak
  // across unmount/remount (e.g. across tests in the same file) and could
  // dispatch into a session that's no longer the active one.
  useEffect(() => {
    return () => {
      if (resolveTimeoutRef.current !== null) {
        clearTimeout(resolveTimeoutRef.current);
      }
    };
  }, []);

  function requestNextProbe(): void {
    const session = sessionRef.current;
    if (!session) return;
    const result: NextProbeResult = session.nextProbe();
    if (result.status === "probe") {
      dispatch({ type: "PROBE_READY", probe: result.probe });
    } else {
      dispatch({ type: "SESSION_COMPLETE", reason: result.reason });
      const assignments = session.getAssignments();
      if (assignments.length > 0) void onAssignments(assignments);
    }
  }

  useEffect(() => {
    if (initializedRef.current) return; // guards against StrictMode's double-invoke building two engines
    initializedRef.current = true;

    let cancelled = false;
    void (async () => {
      const priorEvents = await loadPriorEventsImpl();
      if (cancelled) return;
      sessionRef.current = new AssessmentSession({
        sessionId,
        pool,
        priorEvents,
        ...(config ? { config } : {}),
        ...(deps ? { deps } : {}),
      });
      requestNextProbe();
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately runs once per mount only — see initializedRef above
    // (there is no react-hooks eslint plugin configured in this project
    // to silence, so this is just a plain comment, not a disable directive).
  }, []);

  // Latency origin: a timestamp captured after the options actually
  // paint (via requestAnimationFrame), not at probe-fetch time.
  useEffect(() => {
    if (state.phase !== "probing" || !state.probe) return undefined;
    const frame = requestAnimationFrame(() => {
      shownAtRef.current = nowMs();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.probe, nowMs]);

  function submitResponse(selected: string): void {
    const session = sessionRef.current;
    if (!session || state.phase !== "probing" || !state.probe) return;

    const latencyMs =
      shownAtRef.current === null ? 0 : Math.max(0, Math.round(nowMs() - shownAtRef.current));
    const outcome = selected === state.probe.character ? "correct" : "incorrect";

    const result = session.recordResponse({
      character: state.probe.character,
      outcome,
      latencyMs,
      // No adult-presence detection UI exists yet — a documented
      // placeholder default, not a measured signal. Revisit if/when this
      // change gets a real "adult present" affordance.
      adultPresent: true,
    });

    void onEvent(result.event);
    dispatch({ type: "RESPONDED", selected, correct: outcome === "correct" });

    resolveTimeoutRef.current = setTimeout(() => {
      resolveTimeoutRef.current = null;
      requestNextProbe();
    }, RESOLVE_DELAY_MS);
  }

  function rate(rating: Rating): void {
    // Same shape as submitResponse: the side effect runs directly (not
    // through the reducer, which stays a pure phase-transition machine),
    // then a payload-less action just settles ratingPhase.
    void onRating({ sessionId, rating, recordedAt: new Date().toISOString() });
    dispatch({ type: "RATED" });
  }

  function skipRating(): void {
    dispatch({ type: "RATING_SKIPPED" });
  }

  return { state, submitResponse, rate, skipRating };
}
