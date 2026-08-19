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

export interface PointerGate {
  onPointerDown(event: PointerLikeEvent): void;
  onPointerUp(event: PointerLikeEvent): void;
  onPointerCancel(event: PointerLikeEvent): void;
  /** Whether an event of this pointer type should be accepted right now. */
  shouldAccept(event: PointerLikeEvent): boolean;
}

const DEFAULT_GRACE_MS = 500;

export function createPointerGate(options: PointerGateOptions = {}): PointerGate {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const now = options.now ?? (() => Date.now());

  const activePenPointers = new Set<number>();
  let penLastActiveAt: number | null = null;

  function isPenActive(): boolean {
    if (activePenPointers.size > 0) return true;
    if (penLastActiveAt === null) return false;
    return now() - penLastActiveAt < graceMs;
  }

  function notePenActivity(event: PointerLikeEvent, active: boolean): void {
    if (event.pointerType !== "pen") return;
    if (active) {
      activePenPointers.add(event.pointerId);
    } else {
      activePenPointers.delete(event.pointerId);
    }
    penLastActiveAt = now();
  }

  return {
    onPointerDown(event) {
      notePenActivity(event, true);
    },
    onPointerUp(event) {
      notePenActivity(event, false);
    },
    onPointerCancel(event) {
      notePenActivity(event, false);
    },
    shouldAccept(event) {
      // Never trust e.buttons here (spike-confirmed unreliable on a
      // fresh press) — accept/reject decisions are keyed purely on
      // pointerType and the tracked pen-activity state above.
      if (event.pointerType === "pen") return true;
      if (event.pointerType === "touch" && isPenActive()) return false;
      return true; // mouse, or touch with no pen in play
    },
  };
}

/** App-wide singleton for real usage — every TapTarget shares this one
 * instance so pen activity on one button suppresses palm touches on
 * another. Tests should construct their own via `createPointerGate`. */
export const pointerGate: PointerGate = createPointerGate();
