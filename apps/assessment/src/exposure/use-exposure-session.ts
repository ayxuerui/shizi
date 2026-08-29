import { useEffect, useReducer, useRef } from "react";
import { ExposureSession, type SessionDeps } from "@shizi/exposure-engine";
import type { CandidatePool } from "@shizi/character-data";
import { DEFAULT_CURRICULUM_CONFIG } from "@shizi/curriculum";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment } from "@shizi/adaptivity";
import { enqueueAssignments, enqueueEvent, loadAllAssignments, loadPriorEvents } from "../offline/event-queue.js";
import { flushQueue } from "../offline/sync.js";
import { deriveRecentlyIntroduced } from "../session/activity-selector.js";
import { exposureBoutReducer, INITIAL_EXPOSURE_BOUT_STATE, type ExposureBoutState } from "./exposure-machine.js";

async function defaultOnEvent(event: LearnerEvent): Promise<void> {
  await enqueueEvent(event);
  void flushQueue();
}

async function defaultOnAssignments(assignments: readonly ArmAssignment[]): Promise<void> {
  await enqueueAssignments(assignments);
}

export interface UseExposureSessionOptions {
  sessionId: string;
  pool: CandidatePool;
  /** The batch's not-yet-introduced characters, in curriculum order — the
   * caller (activity-selector's "learn" decision) already computed this;
   * it caps how many items this bout presents, so one learn sitting
   * teaches one batch's worth, not curriculum's entire remaining supply. */
  characters: readonly string[];
  deps?: Partial<SessionDeps>;
  loadPriorEvents?: () => Promise<readonly LearnerEvent[]>;
  loadPriorAssignments?: () => Promise<readonly ArmAssignment[]>;
  nowMs?: () => number;
  onEvent?: (event: LearnerEvent) => void | Promise<void>;
  onAssignments?: (assignments: readonly ArmAssignment[]) => void | Promise<void>;
}

export interface UseExposureSessionResult {
  state: ExposureBoutState;
  /** Called by the arm-specific UI once its interaction reaches a
   * positive completion, regardless of tracing/tap quality — per the
   * `exposure` spec's "No grading or failure state" requirement, there is
   * no other outcome this can report. */
  completeItem: () => void;
}

const NEXT_ITEM_DELAY_MS = 500;

export function useExposureSession(options: UseExposureSessionOptions): UseExposureSessionResult {
  const {
    sessionId,
    pool,
    characters,
    deps,
    loadPriorEvents: loadPriorEventsImpl = loadPriorEvents,
    loadPriorAssignments: loadPriorAssignmentsImpl = loadAllAssignments,
    nowMs = () => performance.now(),
    onEvent = defaultOnEvent,
    onAssignments = defaultOnAssignments,
  } = options;

  const [state, dispatch] = useReducer(exposureBoutReducer, INITIAL_EXPOSURE_BOUT_STATE);
  const sessionRef = useRef<ExposureSession | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const nextItemTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushedAssignmentCountRef = useRef(0);
  // A ref, not `state.completedCount`: `requestNextItem` is called both
  // synchronously (on mount) and from inside a `setTimeout` scheduled by
  // `completeItem` — that callback closes over whichever `requestNextItem`
  // existed at the render `completeItem` ran in, which still sees the
  // PRE-dispatch `state`. A ref sidesteps the stale-closure entirely,
  // mirroring `shownAtRef`/`flushedAssignmentCountRef` below.
  const completedCountRef = useRef(0);

  useEffect(() => {
    return () => {
      if (nextItemTimeoutRef.current !== null) clearTimeout(nextItemTimeoutRef.current);
    };
  }, []);

  function requestNextItem(): void {
    const session = sessionRef.current;
    if (!session) return;
    if (completedCountRef.current >= characters.length) {
      dispatch({ type: "SESSION_COMPLETE" });
      return;
    }

    const result = session.nextItem();
    if (result.status === "item") {
      dispatch({ type: "ITEM_READY", item: result.item });
      const allAssignments = session.getAssignments();
      if (allAssignments.length > flushedAssignmentCountRef.current) {
        const fresh = allAssignments.slice(flushedAssignmentCountRef.current);
        flushedAssignmentCountRef.current = allAssignments.length;
        void onAssignments(fresh);
      }
    } else {
      dispatch({ type: "SESSION_COMPLETE" });
    }
  }

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;
    void (async () => {
      const [priorEvents, priorAssignments] = await Promise.all([
        loadPriorEventsImpl(),
        loadPriorAssignmentsImpl(),
      ]);
      if (cancelled) return;
      const priorRecentlyIntroduced = deriveRecentlyIntroduced(
        priorEvents,
        DEFAULT_CURRICULUM_CONFIG.recentWindowSize,
      );
      sessionRef.current = new ExposureSession({
        sessionId,
        pool,
        priorEvents,
        priorAssignments,
        priorRecentlyIntroduced,
        deps: { ...deps },
      });
      requestNextItem();
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately runs once per mount only — see initializedRef above,
    // mirroring use-assessment-session.ts's identical discipline.
  }, []);

  useEffect(() => {
    if (state.phase !== "presenting" || !state.item) return undefined;
    const frame = requestAnimationFrame(() => {
      shownAtRef.current = nowMs();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.phase, state.item, nowMs]);

  function completeItem(): void {
    const session = sessionRef.current;
    if (!session || state.phase !== "presenting" || !state.item) return;

    const latencyMs = shownAtRef.current === null ? 0 : Math.max(0, Math.round(nowMs() - shownAtRef.current));
    const { event } = session.recordCompletion({
      character: state.item.character,
      latencyMs,
      adultPresent: true,
    });
    void onEvent(event);
    completedCountRef.current += 1;
    dispatch({ type: "ITEM_COMPLETED" });

    nextItemTimeoutRef.current = setTimeout(() => {
      nextItemTimeoutRef.current = null;
      requestNextItem();
    }, NEXT_ITEM_DELAY_MS);
  }

  return { state, completeItem };
}
