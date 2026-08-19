import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { pointerGate, type PointerGate } from "./pointer-gate.js";

export interface UseTapOptions {
  onActivate: () => void;
  disabled?: boolean;
  /** Defaults to the app-wide singleton — tests inject their own. */
  gate?: PointerGate;
}

export interface TapHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerCancel: (event: ReactPointerEvent) => void;
  onPointerLeave: (event: ReactPointerEvent) => void;
  onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
}

/**
 * Commits an activation only on `pointerup` whose `pointerId` matches the
 * `pointerdown` that started on this same element — not `onClick`, since
 * iOS synthesizes click events from palm touches too (confirmed in the
 * pencil-input P0 spike's findings). Also reports every pen contact into
 * the shared pointer gate (see pointer-gate.ts) so OTHER tap targets can
 * reject an incidental palm touch while this one is being tapped with
 * the stylus.
 */
export function useTap({ onActivate, disabled = false, gate = pointerGate }: UseTapOptions): TapHandlers {
  const downPointerId = useRef<number | null>(null);

  const onPointerDown = (event: ReactPointerEvent): void => {
    gate.onPointerDown(event);
    if (disabled) return;
    if (!gate.shouldAccept(event)) return;
    downPointerId.current = event.pointerId;
  };

  const onPointerUp = (event: ReactPointerEvent): void => {
    gate.onPointerUp(event);
    if (disabled) return;
    if (downPointerId.current !== event.pointerId) return;
    downPointerId.current = null;
    if (!gate.shouldAccept(event)) return; // re-check at commit time too
    onActivate();
  };

  const onPointerCancel = (event: ReactPointerEvent): void => {
    gate.onPointerCancel(event);
    downPointerId.current = null;
  };

  const onPointerLeave = (event: ReactPointerEvent): void => {
    // A pointer leaving the element's bounds (finger sliding off) should
    // not commit an activation, but must not be mistaken for a cancel
    // that clears pen-active state prematurely either.
    if (downPointerId.current === event.pointerId) {
      downPointerId.current = null;
    }
  };

  const onKeyDown: TapHandlers["onKeyDown"] = (event) => {
    if (disabled) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };

  return { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onKeyDown };
}
