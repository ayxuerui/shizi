import { getSharedAudioContext, resumeIfSuspended } from "./shared-context.js";

export interface UnlockableAudioElement {
  currentTime: number;
  play: () => Promise<void>;
}

export interface AudioUnlockDeps {
  createAudioContext: () => AudioContext;
  /** The real `<audio>` element rendered by `AudioUnlockGate`; tests inject a fake. */
  audioElement: UnlockableAudioElement;
  delay: (ms: number) => Promise<void>;
}

export type AudioUnlockStatus = "not-attempted" | "in-flight" | "unlocked" | "failed";

let unlockPromise: Promise<AudioContext> | null = null;
let status: AudioUnlockStatus = "not-attempted";

/**
 * Task 8.3's first-gesture audio-unlock sequence, per design.md's "Audio
 * unlock requires an HTMLMediaElement, not just AudioContext.resume()"
 * decision — confirmed directly on iPad Air Safari
 * (`spikes/ios-constraints/index.html`), not assumed from documentation:
 *
 * 1. Play a clip through a plain `HTMLAudioElement` on the gesture —
 *    this is what actually opens the native audio session.
 *    `AudioContext.resume()` alone can leave WebAudio silent even though
 *    `.state` reports "running".
 * 2. THEN get/resume the single SHARED `AudioContext` (see
 *    shared-context.ts — two concurrent contexts caused one to go silent
 *    in the spike).
 * 3. Wait a short settle delay — the spike found `.state` can flip to
 *    "running" before the native session has actually finished opening
 *    its output route.
 *
 * Memoized: a second call while (or after) the first is in flight
 * returns the same promise rather than re-running the sequence.
 */
export function unlockAudio(deps: AudioUnlockDeps): Promise<AudioContext> {
  if (unlockPromise) return unlockPromise;

  status = "in-flight";
  unlockPromise = (async () => {
    try {
      deps.audioElement.currentTime = 0;
      await deps.audioElement.play();

      const context = getSharedAudioContext(deps.createAudioContext);
      await resumeIfSuspended(context);

      await deps.delay(150);

      status = "unlocked";
      return context;
    } catch (error) {
      status = "failed";
      throw error;
    }
  })();

  return unlockPromise;
}

/**
 * `AudioUnlockGate` discards the unlock outcome (its `finally` proceeds
 * either way, per the silent-mode-fallback design) — this is the one
 * place that outcome is still observable, for
 * `diagnostics/capabilities/audio.ts`'s pre-flight report. Does NOT
 * un-memoize `unlockAudio` itself: one unlock per session is the correct
 * production guarantee, and diagnostics reads this status rather than
 * forcing a second real attempt.
 */
export function audioUnlockStatus(): AudioUnlockStatus {
  return status;
}

/** Test-only: resets memoization so each test exercises a fresh sequence. */
export function __resetAudioUnlockForTests(): void {
  unlockPromise = null;
  status = "not-attempted";
}
