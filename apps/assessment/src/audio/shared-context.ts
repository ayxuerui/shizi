/**
 * A SINGLE module-scope `AudioContext` — the ios-constraints P0 spike
 * found that two concurrent contexts caused one of them to go silent, so
 * every consumer in this app must share exactly one instance rather than
 * each creating its own.
 */
let sharedContext: AudioContext | null = null;

export function getSharedAudioContext(factory: () => AudioContext = () => new AudioContext()): AudioContext {
  if (!sharedContext) {
    sharedContext = factory();
  }
  return sharedContext;
}

export async function resumeIfSuspended(context: AudioContext): Promise<void> {
  if (context.state === "suspended") {
    await context.resume();
  }
}

/**
 * Wires automatic resume-on-foreground: iOS suspends the audio session
 * when the app backgrounds, a case the ios-constraints spike never had
 * to cover (it only ever tested a single foreground gesture). Called
 * once by `AudioUnlockGate` after the unlock sequence succeeds — not
 * auto-installed at module load, so it stays explicit and testable.
 * Returns an unsubscribe function.
 */
export function wireVisibilityResume(context: AudioContext, doc: Document = document): () => void {
  const handler = (): void => {
    if (doc.visibilityState === "visible") {
      void resumeIfSuspended(context);
    }
  };
  doc.addEventListener("visibilitychange", handler);
  return () => doc.removeEventListener("visibilitychange", handler);
}

/** Test-only: resets the module singleton so each test gets a fresh context. */
export function __resetSharedAudioContextForTests(): void {
  sharedContext = null;
}
