import type { ReactNode } from "react";
import { useTap } from "../input/use-tap.js";

export interface TapTargetProps {
  onActivate: () => void;
  disabled?: boolean;
  label: string;
  children: ReactNode;
}

/**
 * The shared tap-target primitive every interactive control in this app
 * renders through — `input/pointer-gate.ts` + `input/use-tap.ts` give it
 * palm-rejection while a stylus is in use, and `--tap-min-size`/
 * `--tap-gap` (styles/tokens.css) give it a hit area sized for a
 * preschool child's motor control, per `assessment` spec's "Touch and
 * stylus input support" requirement.
 */
export function TapTarget({ onActivate, disabled = false, label, children }: TapTargetProps) {
  const tap = useTap({ onActivate, disabled });

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={tap.onPointerDown}
      onPointerUp={tap.onPointerUp}
      onPointerCancel={tap.onPointerCancel}
      onPointerLeave={tap.onPointerLeave}
      onKeyDown={tap.onKeyDown}
      style={{
        minInlineSize: "var(--tap-min-size)",
        minBlockSize: "var(--tap-min-size)",
        borderRadius: "var(--radius-lg)",
        border: "none",
        background: "var(--color-surface)",
        boxShadow: "var(--shadow-soft)",
        touchAction: "manipulation",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
