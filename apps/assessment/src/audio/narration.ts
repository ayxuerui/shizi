import { selectChineseVoices, waitForVoices, type VoiceLike } from "./voices.js";

export interface PromptVoice {
  speak(character: string): void;
  /** Whether narration is actually available in this session, so the UI
   * can degrade (rely on the on-screen glyph / a "listen again" control
   * that quietly does nothing) rather than assume it always works. Real
   * only once `primeVoices()` has resolved AND found an actual zh voice —
   * see this function's own doc comment on why a pure API-presence check
   * used to live here instead, and why that was actively misleading. */
  isAvailable(): boolean;
  /** Resolves once voice priming has settled (found a zh voice, or timed
   * out without one) — called once by `ProbePanel` in an effect. */
  primeVoices(): Promise<void>;
}

/**
 * PLACEHOLDER, documented rather than silent: the "hear" half of this
 * change's only modality (hear-tap) needs SOMETHING to speak the target
 * character aloud. Real family-voice narration is explicitly out of
 * scope for this change (`progression-and-voices`, per proposal.md) —
 * this stub uses the Web Speech API's `SpeechSynthesis` for Chinese
 * (zh-CN) so the interaction is playable now.
 *
 * `isAvailable()` used to only check that the `SpeechSynthesis` API
 * OBJECT existed — true on iPad Safari even with zero Chinese voices
 * installed, i.e. true in exactly the failure case `design.md` flags as
 * this project's biggest open risk. Wiring that predicate as-is (task
 * 10.0's diagnostics work) would have converted a dead seam into a
 * FALSE-CONFIDENCE one, which is worse. It now reflects whether priming
 * actually found a usable zh/cmn voice — see
 * `diagnostics/capabilities/voices.ts`'s `waitForVoices`, which also
 * handles iOS returning `getVoices() === []` on the first call.
 *
 * If no zh voice exists at all, there is no meaningful degrade beyond
 * "keep the glyph, drop the 'listen again' control that would otherwise
 * silently do nothing" (see `ProbePanel.tsx`) — a hear-tap game with no
 * prompt voice is unplayable as designed, and that's a human decision
 * (real recorded audio, or a different modality), not something to paper
 * over here.
 */
export function createSpeechSynthesisPromptVoice(
  synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined,
): PromptVoice {
  let primed = false;
  let chineseVoice: VoiceLike | undefined;

  return {
    speak(character: string) {
      if (!synth) return;
      const utterance = new SpeechSynthesisUtterance(character);
      utterance.lang = "zh-CN";
      if (chineseVoice) utterance.voice = chineseVoice as SpeechSynthesisVoice;
      synth.cancel(); // don't stack repeated "listen again" taps
      synth.speak(utterance);
    },
    isAvailable() {
      return synth !== undefined && primed && chineseVoice !== undefined;
    },
    async primeVoices() {
      if (!synth || primed) return;
      const voices = await waitForVoices(synth);
      chineseVoice = selectChineseVoices(voices)[0];
      primed = true;
    },
  };
}
