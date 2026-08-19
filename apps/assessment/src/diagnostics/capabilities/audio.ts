import { loadClip, playBuffer } from "../../audio/play.js";
import { peekSharedAudioContext } from "../../audio/shared-context.js";
import { audioUnlockStatus, type AudioUnlockStatus } from "../../audio/audio-unlock.js";

export type PlaybackOutcome =
  | { status: "played"; startedAfterMs: number }
  | { status: "no-progress"; waitedMs: number }
  | { status: "failed"; reason: string };

export interface AudioLike {
  currentTime: number;
  play(): Promise<void>;
}

export interface ProbeElementPlaybackDeps {
  createAudio: (url: string) => AudioLike;
  url: string;
  timeoutMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

/**
 * Task 10.0 item (b): does NOT reuse `audio/play.ts`'s `playViaElement` —
 * that function deliberately swallows every error and returns `void`,
 * which is correct for the child-facing cue path but useless for a
 * pre-flight report. This observes `currentTime` actually advancing
 * instead. Proof of PLAYBACK, not proof of AUDIBILITY — see
 * `types.ts`'s `HumanVerdict`, asked separately.
 */
export async function probeElementPlayback(deps: ProbeElementPlaybackDeps): Promise<PlaybackOutcome> {
  const timeoutMs = deps.timeoutMs ?? 3000;
  const now = deps.now ?? (() => Date.now());
  const delay = deps.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const audio = deps.createAudio(deps.url);
  const startedAt = now();

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }

  while (now() - startedAt < timeoutMs) {
    if (audio.currentTime > 0) {
      return { status: "played", startedAfterMs: now() - startedAt };
    }
    await delay(50);
  }
  return { status: "no-progress", waitedMs: now() - startedAt };
}

export interface SharedContextStatus {
  created: boolean;
  state?: AudioContextState;
}

/**
 * Peek-only (see `shared-context.ts`'s `peekSharedAudioContext` doc
 * comment) — reporting "has a context been created" must never itself
 * create a pre-gesture one.
 */
export function describeSharedContext(): SharedContextStatus {
  const context = peekSharedAudioContext();
  if (!context) return { created: false };
  return { created: true, state: context.state };
}

export function describeAudioUnlock(): AudioUnlockStatus {
  return audioUnlockStatus();
}

/**
 * Exercises the WebAudio path (`loadClip`/`playBuffer`) — currently DEAD
 * CODE in production; `feedback/use-interaction-sound.ts` only ever uses
 * `playViaElement`. This is the first thing in the app that actually
 * runs the path the whole unlock sequence exists to enable. Only offered
 * once unlock has actually succeeded (see `describeAudioUnlock` above) —
 * calling this beforehand would create a pre-gesture context.
 */
export async function probeWebAudioPath(context: AudioContext, url: string): Promise<PlaybackOutcome> {
  const startedAt = Date.now();
  try {
    const buffer = await loadClip(context, url);
    playBuffer(context, buffer);
    return { status: "played", startedAfterMs: Date.now() - startedAt };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
