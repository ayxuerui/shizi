import { useEffect, useMemo, useState } from "react";
import { createSpeechSynthesisPromptVoice } from "../audio/narration.js";
import { TapTarget } from "../components/TapTarget.js";
import { COPY } from "../copy.js";

export interface ListenExposureProps {
  character: string;
  onComplete: () => void;
}

/**
 * The `expose-listen` arm (`add-tracing-modality-arm` exposure spec): the
 * character shown large and spoken aloud, tapped to continue. No grading,
 * no wrong answer possible — tapping the giant character IS the whole
 * interaction, per the spec's "No grading or failure state" requirement.
 *
 * `aria-label`s below are deliberately inline, not routed through
 * `copy.ts`'s `COPY` — they're accessible-name-only text (never visually
 * rendered, see `TapTarget`'s `aria-label={label}` / separate `children`
 * split), so including them in `collectCopyCharacters()`'s font-subset
 * scan would be pointless work with no visible payoff, and the actual
 * building block here (the target character itself) already comes from
 * the pool, which the font subset already covers.
 */
export function ListenExposure({ character, onComplete }: ListenExposureProps) {
  const promptVoice = useMemo(() => createSpeechSynthesisPromptVoice(), []);
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void promptVoice.primeVoices().then(() => {
      if (!cancelled) setVoiceAvailable(promptVoice.isAvailable());
    });
    return () => {
      cancelled = true;
    };
  }, [promptVoice]);

  useEffect(() => {
    promptVoice.speak(character);
  }, [character, promptVoice]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
      <TapTarget label="知道了，继续" onActivate={onComplete}>
        <span style={{ fontSize: "6rem", display: "block", padding: "1rem" }}>{character}</span>
      </TapTarget>
      {voiceAvailable && (
        <TapTarget label={COPY.probe.listenAgain} onActivate={() => promptVoice.speak(character)}>
          <span>{COPY.probe.listenAgain}</span>
        </TapTarget>
      )}
    </div>
  );
}
