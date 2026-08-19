import { useEffect, useMemo } from "react";
import type { ProbeItem } from "@shizi/assessment-engine";
import { createSpeechSynthesisPromptVoice } from "../audio/narration.js";
import { TapTarget } from "../components/TapTarget.js";
import { COPY } from "../copy.js";
import type { ResponseCue } from "../session/bout-machine.js";

export interface ProbePanelProps {
  probe: ProbeItem;
  /** True while resolving a just-answered probe — options stop accepting input. */
  disabled: boolean;
  /** The just-tapped option, and its cue, only set while resolving. Both
   * null during normal probing (no per-option styling to apply yet). */
  selected: string | null;
  cue: ResponseCue | null;
  onSelect: (character: string) => void;
}

function optionStyle(option: ProbeItem["character"], probe: ProbeItem, selected: string | null, cue: ResponseCue | null) {
  if (!cue) return {};
  const isTarget = option === probe.character;
  const isSelected = option === selected;

  if (cue === "acknowledge" && isTarget) {
    // Correct tap: the (correctly) tapped target gets a calm warm halo.
    return { boxShadow: "0 0 0 4px var(--color-accent)", transition: "box-shadow 250ms ease" };
  }
  if (cue === "redirect") {
    if (isSelected) {
      // Incorrect tap: the tapped (wrong) option softly settles back —
      // no red, no shake, no "wrong" indicator of any kind.
      return { opacity: 0.6, transform: "scale(0.97)", transition: "opacity 250ms ease, transform 250ms ease" };
    }
    if (isTarget) {
      // The actual target gets the same calm halo an acknowledge would —
      // structurally the identical visual language, never a distinct
      // "you got it wrong, here's the real answer" callout.
      return { boxShadow: "0 0 0 4px var(--color-accent)", transition: "box-shadow 250ms ease" };
    }
  }
  return {};
}

/**
 * Renders `probe.options` (already shuffled, target included — see
 * `assessment-engine`'s `distractors.ts`) as tap targets, and speaks the
 * target character (the "hear" half of hear-tap) both automatically when
 * a new probe appears and again on "listen again". Guess detection
 * itself (confirming/inconclusive/miss, known/shaky) is entirely
 * invisible here — this component only ever sees `probe`, `selected`,
 * and `cue` (which is `"acknowledge" | "redirect"`, never anything
 * resembling an error), never a correctness signal from the engine
 * directly.
 */
export function ProbePanel({ probe, disabled, selected, cue, onSelect }: ProbePanelProps) {
  const promptVoice = useMemo(() => createSpeechSynthesisPromptVoice(), []);

  useEffect(() => {
    promptVoice.speak(probe.character);
  }, [probe.character, promptVoice]);

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "var(--tap-gap)",
        }}
      >
        {probe.options.map((option) => (
          <TapTarget key={option} label={option} disabled={disabled} onActivate={() => onSelect(option)}>
            <span style={{ fontSize: "3rem", display: "block", ...optionStyle(option, probe, selected, cue) }}>
              {option}
            </span>
          </TapTarget>
        ))}
      </div>
      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
        <TapTarget
          label={COPY.probe.listenAgain}
          disabled={disabled}
          onActivate={() => promptVoice.speak(probe.character)}
        >
          <span>{COPY.probe.listenAgain}</span>
        </TapTarget>
      </div>
    </div>
  );
}
