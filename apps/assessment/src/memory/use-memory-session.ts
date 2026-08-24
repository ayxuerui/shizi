import { useEffect, useReducer, useRef } from "react";
import type { CandidatePool } from "@shizi/character-data";
import type { LearnerEvent } from "@shizi/learner-state";
import { MemorySession, type MemorySessionDeps } from "../session/memory-session.js";
import { enqueueEvent, loadPriorEvents } from "../offline/event-queue.js";
import { flushQueue } from "../offline/sync.js";
import { INITIAL_MEMORY_BOUT_STATE, memoryBoutReducer, type MemoryBoutState } from "./memory-machine.js";

async function defaultOnEvent(event: LearnerEvent): Promise<void> {
  await enqueueEvent(event);
  void flushQueue();
}

export interface UseMemorySessionOptions {
  sessionId: string;
  pool: CandidatePool;
  dueCharacters: readonly string[];
  deps?: Partial<MemorySessionDeps>;
  loadPriorEvents?: () => Promise<readonly LearnerEvent[]>;
  nowMs?: () => number;
  onEvent?: (event: LearnerEvent) => void | Promise<void>;
}

export interface UseMemorySessionResult {
  state: MemoryBoutState;
  submitResponse: (selected: string) => void;
}

const RESOLVE_DELAY_MS = 700;

/** Composition seam between `MemorySession` and this app's UI — same
 * shape as `session/use-assessment-session.ts`, simplified (no rating,
 * no duration bound). */
export function useMemorySession(options: UseMemorySessionOptions): UseMemorySessionResult {
  const {
    sessionId,
    pool,
    dueCharacters,
    deps,
    loadPriorEvents: loadPriorEventsImpl = loadPriorEvents,
    nowMs = () => performance.now(),
    onEvent = defaultOnEvent,
  } = options;

  const [state, dispatch] = useReducer(memoryBoutReducer, INITIAL_MEMORY_BOUT_STATE);
  const sessionRef = useRef<MemorySession | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const resolveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resolveTimeoutRef.current !== null) clearTimeout(resolveTimeoutRef.current);
    };
  }, []);

  function requestNextProbe(): void {
    const session = sessionRef.current;
    if (!session) return;
    const result = session.nextProbe();
    if (result.status === "probe") {
      dispatch({ type: "PROBE_READY", probe: result.probe });
    } else {
      dispatch({ type: "SESSION_COMPLETE" });
    }
  }

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;
    void (async () => {
      const priorEvents = await loadPriorEventsImpl();
      if (cancelled) return;
      sessionRef.current = new MemorySession({ sessionId, pool, dueCharacters, priorEvents, deps: { ...deps } });
      requestNextProbe();
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately runs once per mount only — see initializedRef above.
  }, []);

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

    const latencyMs = shownAtRef.current === null ? 0 : Math.max(0, Math.round(nowMs() - shownAtRef.current));
    const outcome = selected === state.probe.character ? "correct" : "incorrect";

    const { event } = session.recordResponse({
      character: state.probe.character,
      outcome,
      latencyMs,
      adultPresent: true,
    });

    void onEvent(event);
    dispatch({ type: "RESPONDED", selected, correct: outcome === "correct" });

    resolveTimeoutRef.current = setTimeout(() => {
      resolveTimeoutRef.current = null;
      requestNextProbe();
    }, RESOLVE_DELAY_MS);
  }

  return { state, submitResponse };
}
