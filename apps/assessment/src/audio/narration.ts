export interface PromptVoice {
  speak(character: string): void;
  /** Whether narration is actually available in this session, so the UI
   * can degrade (rely on the on-screen glyph / a "listen again" control
   * that quietly does nothing) rather than assume it always works. */
  isAvailable(): boolean;
}

/**
 * PLACEHOLDER, documented rather than silent: the "hear" half of this
 * change's only modality (hear-tap) needs SOMETHING to speak the target
 * character aloud. Real family-voice narration is explicitly out of
 * scope for this change (`progression-and-voices`, per proposal.md) —
 * this stub uses the Web Speech API's `SpeechSynthesis` for Chinese
 * (zh-CN) so the interaction is playable now.
 *
 * KNOWN GAP, flagged in design.md: zh-CN voice availability on iPad
 * Safari is unverified (no P0 spike covered this). `isAvailable()` is
 * the seam for the UI to detect and degrade gracefully rather than tap
 * silently doing nothing with no indication why.
 */
export function createSpeechSynthesisPromptVoice(
  synth: SpeechSynthesis | undefined = typeof window !== "undefined" ? window.speechSynthesis : undefined,
): PromptVoice {
  return {
    speak(character: string) {
      if (!synth) return;
      const utterance = new SpeechSynthesisUtterance(character);
      utterance.lang = "zh-CN";
      synth.cancel(); // don't stack repeated "listen again" taps
      synth.speak(utterance);
    },
    isAvailable() {
      return synth !== undefined && typeof SpeechSynthesisUtterance !== "undefined";
    },
  };
}
