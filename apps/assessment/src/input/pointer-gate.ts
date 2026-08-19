/**
 * Per `assessment` spec's "Touch and stylus input support" requirement:
 * suppresses incidental palm-touch input while a stylus is in use. This
 * game's only interaction is discrete taps on large buttons (no freehand
 * drawing/tracing — see design.md's confirmation that this change never
 * needs stroke input), so the problem is much narrower than the
 * pencil-input P0 spike's raw-canvas-drawing case: reject `touch`
 * pointer events that arrive while a `pen` pointer is (or very recently
 * was) in contact, rather than capture and filter a freehand stroke.
 *
 * Shared across every tap target in the app (not per-button state) —
 * the child's palm and the pencil tip are usually touching two DIFFERENT
 * buttons at once, so each `TapTarget` reporting into one shared gate is
 * what lets a pen-down on button A suppress an incidental touch-down on
 * button B.
 */
export interface PointerLikeEvent {
  pointerId: number;
  pointerType: string;
}

export interface PointerGateOptions {
  /** How long after a pen pointer lifts a concurrent touch is still
   * rejected — the palm can outlive the pencil's own liftoff by a beat. */
  graceMs?: number;
  now?: () => number;
}

/** One decision/activity record, for `diagnostics/capabilities/pointer.ts`'s
 * palm-rejection pre-flight check — task 10.0's item (c). The gate's
 * verdicts alone (`shouldAccept`) can't show "14 palm touches were
 * rejected during that two-handed run"; a decision stream can. */
export interface PointerDecisionRecord {
  at: number;
  phase: "down" | "up" | "cancel" | "decide";
  pointerType: string;
  pointerId: number;
  accepted?: boolean;
  penActive: boolean;
}

export interface PointerGate {
  onPointerDown(event: PointerLikeEvent): void;
  onPointerUp(event: PointerLikeEvent): void;
  onPointerCancel(event: PointerLikeEvent): void;
  /** Whether an event of this pointer type should be accepted right now. */
  shouldAccept(event: PointerLikeEvent): boolean;
  /** Diagnostics-only observability, not used by the real tap path (see
   * `use-tap.ts`). Returns an unsubscribe function. A throwing listener
   * is swallowed — a diagnostics bug must never break the child's ability
   * to tap, the same reasoning `audio/play.ts`'s `playViaElement` already
   * applies to its own failure mode. */
  subscribe(listener: (record: PointerDecisionRecord) => void): () => void;
}

const DEFAULT_GRACE_MS = 500;

export function createPointerGate(options: PointerGateOptions = {}): PointerGate {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const now = options.now ?? (() => Date.now());

  const activePenPointers = new Set<number>();
  let penLastActiveAt: number | null = null;
  const listeners = new Set<(record: PointerDecisionRecord) => void>();

  function isPenActive(): boolean {
    if (activePenPointers.size > 0) return true;
    if (penLastActiveAt === null) return false;
    return now() - penLastActiveAt < graceMs;
  }

  function emit(record: PointerDecisionRecord): void {
    for (const listener of listeners) {
      try {
        listener(record);
      } catch {
        // Swallowed — see PointerGate.subscribe's doc comment.
      }
    }
  }

  function notePenActivity(event: PointerLikeEvent, active: boolean, phase: "down" | "up" | "cancel"): void {
    if (event.pointerType !== "pen") return;
    if (active) {
      activePenPointers.add(event.pointerId);
    } else {
      activePenPointers.delete(event.pointerId);
    }
    penLastActiveAt = now();
    emit({ at: now(), phase, pointerType: event.pointerType, pointerId: event.pointerId, penActive: isPenActive() });
  }

  return {
    onPointerDown(event) {
      notePenActivity(event, true, "down");
    },
    onPointerUp(event) {
      notePenActivity(event, false, "up");
    },
    onPointerCancel(event) {
      notePenActivity(event, false, "cancel");
    },
    shouldAccept(event) {
      // Never trust e.buttons here (spike-confirmed unreliable on a
      // fresh press) — accept/reject decisions are keyed purely on
      // pointerType and the tracked pen-activity state above.
      const penActive = isPenActive();
      const accepted = event.pointerType === "pen" || !(event.pointerType === "touch" && penActive);
      emit({
        at: now(),
        phase: "decide",
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        accepted,
        penActive,
      });
      return accepted; // mouse, or touch with no pen in play, is also accepted
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** App-wide singleton for real usage — every TapTarget shares this one
 * instance so pen activity on one button suppresses palm touches on
 * another. Tests should construct their own via `createPointerGate`
 * EXCEPT `diagnostics/PenPalmProbe.tsx`'s own test, which deliberately
 * observes this real shared instance — see `__resetPointerGateForTests`
 * below for clearing state between those tests. */
export let pointerGate: PointerGate = createPointerGate();

/** Test-only: rebuilds the shared singleton so pen-active state from one
 * test can't leak into the next (ES module bindings are live, so
 * existing `import { pointerGate }` call sites see the fresh instance). */
export function __resetPointerGateForTests(): void {
  pointerGate = createPointerGate();
}
