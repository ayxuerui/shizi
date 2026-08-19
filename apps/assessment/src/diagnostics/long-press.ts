/**
 * The primary diagnostics entry — a sustained hold on an unlabeled corner
 * of the unlock screen (see `DiagnosticsCornerTrigger.tsx`). This is
 * deliberately NOT wired through `input/pointer-gate.ts`'s shared gate:
 * reporting this trigger's pen/touch contact into that gate would pollute
 * its pen-active state and could suppress the parent's own subsequent
 * taps on the real unlock button.
 *
 * A long hold (not "tap N times") is the point: a child mashing the start
 * screen produces short, repeated taps, not one sustained 1.5s hold in a
 * corner that isn't the visually obvious button.
 */
export interface LongPressOptions {
  holdMs?: number;
  onTrigger: () => void;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

export interface LongPressHandlers {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
}

const DEFAULT_HOLD_MS = 1500;

export function createLongPress(options: LongPressOptions): LongPressHandlers {
  const holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => window.clearTimeout(id));

  let timerId: number | null = null;

  function cancel(): void {
    if (timerId !== null) {
      clearTimer(timerId);
      timerId = null;
    }
  }

  function start(): void {
    cancel(); // guard against a stray second pointerdown before the first resolves
    timerId = setTimer(() => {
      timerId = null;
      options.onTrigger();
    }, holdMs);
  }

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
