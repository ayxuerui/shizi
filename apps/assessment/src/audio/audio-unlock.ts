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

let unlockPromise: Promise<AudioContext> | null = null;

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

  unlockPromise = (async () => {
    deps.audioElement.currentTime = 0;
    await deps.audioElement.play();

    const context = getSharedAudioContext(deps.createAudioContext);
    await resumeIfSuspended(context);

    await deps.delay(150);

    return context;
  })();

  return unlockPromise;
}

/** Test-only: resets memoization so each test exercises a fresh sequence. */
export function __resetAudioUnlockForTests(): void {
  unlockPromise = null;
}
