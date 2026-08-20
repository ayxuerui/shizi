export interface SessionClock {
  /** Passed straight into `AssessmentSession`'s `SessionDeps.elapsedMs` —
   * the engine's own constructor read (`session.ts`'s `startElapsedMs`)
   * IS what latches the origin here, not a copy of it that could drift
   * by a render. */
  elapsedMs: () => number;
  /** `null` until that latch happens — a render that happens before the
   * engine exists (still awaiting `loadPriorEvents`) must not steal the
   * origin by reading through this instead of `elapsedMs`. */
  elapsedSinceStartMs: () => number | null;
}

export interface CreateSessionClockOptions {
  /** Underlying clock read, defaulting to `performance.now()` (monotonic —
   * unlike the engine's own `Date.now()` default, immune to an NTP/wall-
   * clock step moving the session's duration bound mid-bout). Tests
   * inject a scripted sequence. */
  elapsedMs?: () => number;
}

/**
 * A factory, not a singleton — one instance per session/mount, like
 * `input/pointer-gate.ts`'s `createPointerGate`. No `__resetForTests` is
 * needed for the same reason: nothing module-level to reset.
 */
export function createSessionClock(options: CreateSessionClockOptions = {}): SessionClock {
  const read = options.elapsedMs ?? (() => performance.now());
  let origin: number | null = null;

  function elapsedMs(): number {
    const value = read();
    if (origin === null) origin = value;
    return value;
  }

  function elapsedSinceStartMs(): number | null {
    if (origin === null) return null;
    return Math.max(0, read() - origin);
  }

  return { elapsedMs, elapsedSinceStartMs };
}
