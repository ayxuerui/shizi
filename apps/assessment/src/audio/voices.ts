/**
 * `narration.ts`'s `isAvailable()` only checks that `SpeechSynthesis`
 * exists as an API — on iPad Safari that's true even with ZERO Chinese
 * voices installed, which is exactly the failure `design.md` names as
 * this project's biggest open risk. This module is what actually answers
 * "is there a usable zh voice," for both the diagnostics report and
 * `narration.ts`'s real fix (see that file's updated `isAvailable()`).
 *
 * Structural types, not the DOM lib's `SpeechSynthesis`/`SpeechSynthesisVoice`
 * — jsdom has neither, so tests construct plain fakes; the real
 * `window.speechSynthesis` satisfies this shape.
 */
export interface VoiceLike {
  lang: string;
  name: string;
}

export interface SpeechSynthesisLike {
  getVoices(): VoiceLike[];
  addEventListener?(type: "voiceschanged", handler: () => void): void;
  removeEventListener?(type: "voiceschanged", handler: () => void): void;
}

/** Matches "zh", "zh-CN", "zh_CN", "zh-Hans-CN", "cmn-Hans-CN", etc. — not just an exact "zh-CN". */
export function selectChineseVoices(voices: readonly VoiceLike[]): VoiceLike[] {
  return voices.filter((voice) => {
    const lang = voice.lang.replace(/_/g, "-").toLowerCase();
    return lang === "zh" || lang.startsWith("zh-") || lang === "cmn" || lang.startsWith("cmn-");
  });
}

export interface WaitForVoicesDeps {
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

/**
 * iOS Safari reality this has to handle: `getVoices()` returns `[]` on
 * the very first synchronous call, and `voiceschanged` is not reliably
 * fired at all — so this races BOTH a `voiceschanged` listener and a
 * short poll, resolving as soon as either sees a non-empty list, and
 * resolves with whatever's there (possibly still empty) at the timeout
 * rather than reporting "unavailable" prematurely.
 */
export async function waitForVoices(synth: SpeechSynthesisLike, deps: WaitForVoicesDeps = {}): Promise<VoiceLike[]> {
  const timeoutMs = deps.timeoutMs ?? 3000;
  const pollMs = deps.pollMs ?? 250;
  const now = deps.now ?? (() => Date.now());
  const delay = deps.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const immediate = synth.getVoices();
  if (immediate.length > 0) return immediate;

  return new Promise<VoiceLike[]>((resolve) => {
    let settled = false;
    const finish = (voices: VoiceLike[]): void => {
      if (settled) return;
      settled = true;
      synth.removeEventListener?.("voiceschanged", onVoicesChanged);
      resolve(voices);
    };
    const onVoicesChanged = (): void => {
      const voices = synth.getVoices();
      if (voices.length > 0) finish(voices);
    };
    synth.addEventListener?.("voiceschanged", onVoicesChanged);

    const startedAt = now();
    void (async () => {
      while (!settled && now() - startedAt < timeoutMs) {
        await delay(pollMs);
        if (settled) return;
        const voices = synth.getVoices();
        if (voices.length > 0) {
          finish(voices);
          return;
        }
      }
      finish(synth.getVoices());
    })();
  });
}
