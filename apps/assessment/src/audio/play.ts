/**
 * Playback for short, local interaction sounds (the unlock tone, the
 * neutral acknowledge/redirect cue — see feedback/use-interaction-sound.ts)
 * once `audio-unlock.ts`'s sequence has completed. Decoded buffers are
 * cached per URL so a repeated cue (e.g. the same "listen again" tap)
 * doesn't re-fetch/re-decode.
 */
const bufferCache = new Map<string, AudioBuffer>();

export async function loadClip(context: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = bufferCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await context.decodeAudioData(arrayBuffer);
  bufferCache.set(url, buffer);
  return buffer;
}

export function playBuffer(context: AudioContext, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}

/**
 * Fallback path via a plain `HTMLAudioElement` — used before the WebAudio
 * unlock sequence has completed, or if it ever fails. Degrades to "still
 * makes a sound" rather than silent; swallows playback errors, since a
 * failed fallback sound must never surface as a visible error to the
 * child (per the "no visible failure state" requirement's spirit, even
 * though this isn't itself a scored interaction).
 */
export function playViaElement(url: string): void {
  try {
    const audio = new Audio(url);
    const result = audio.play();
    // Some environments (e.g. jsdom in component tests) throw
    // synchronously rather than returning a rejected promise for an
    // unimplemented/unsupported play() — guard both shapes.
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        // Intentionally swallowed.
      });
    }
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}

/** Test-only: clears the decode cache between tests. */
export function __resetClipCacheForTests(): void {
  bufferCache.clear();
}
