import { useRef } from "react";
import { createLongPress, type LongPressHandlers } from "./long-press.js";

export interface DiagnosticsCornerTriggerProps {
  onTrigger: () => void;
}

/**
 * The primary diagnostics entry (see `entry.ts`'s header comment for why
 * this exists alongside the `#diagnostics` hash): an unlabeled corner
 * long-press, rendered ONLY on the unlock screen — see
 * `AudioUnlockGate.tsx`'s `onDiagnosticsRequest` prop. That placement is
 * the whole argument: it's the one screen every cold start (including
 * the airplane-mode one) always shows, it's gone the instant the child
 * starts playing, and it works inside standalone/home-screen mode where
 * there's no address bar to type a hash into.
 *
 * No text content (`aria-label` only) so it can never contribute a
 * character to any `document.body.textContent` assertion — see
 * `BoutScreen.test.tsx`'s `assertNoScoreLikeText` header comment: this
 * component is never mounted in that tree anyway (it's a sibling of the
 * unlock button, unmounted once the game starts), but keeping it
 * text-free means that stays true even if that ever changes.
 */
export function DiagnosticsCornerTrigger({ onTrigger }: DiagnosticsCornerTriggerProps) {
  // onTrigger read through a ref so the latest prop is always called even
  // though the handlers below (and their in-flight timer) are built once.
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;

  // A ref, not useMemo: this must stay the SAME instance across re-renders
  // (a fresh createLongPress() on each render would leave an in-flight
  // timer from a stale closure uncancellable by the new one's onPointerUp).
  const pressRef = useRef<LongPressHandlers | null>(null);
  pressRef.current ??= createLongPress({ onTrigger: () => onTriggerRef.current() });
  const press = pressRef.current;

  return (
    <button
      type="button"
      aria-label="device diagnostics"
      onPointerDown={press.onPointerDown}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onPointerLeave={press.onPointerLeave}
      style={{
        position: "absolute",
        bottom: 0,
        right: 0,
        width: "56px",
        height: "56px",
        border: "none",
        background: "transparent",
        touchAction: "none",
      }}
    />
  );
}
