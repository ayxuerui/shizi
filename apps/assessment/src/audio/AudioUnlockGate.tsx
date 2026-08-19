import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { TapTarget } from "../components/TapTarget.js";
import { COPY } from "../copy.js";
import { unlockAudio } from "./audio-unlock.js";
import { wireVisibilityResume } from "./shared-context.js";

export interface AudioUnlockGateProps {
  children: ReactNode;
}

/**
 * Task 8.3: a single full-screen tap target that runs the audio-unlock
 * sequence (audio-unlock.ts) on the first gesture, then renders the rest
 * of the app. On failure, proceeds in silent mode rather than blocking
 * the child indefinitely — a stalled unlock screen is a worse outcome
 * than a session with no sound.
 */
export function AudioUnlockGate({ children }: AudioUnlockGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleTap = async (): Promise<void> => {
    const audioElement = audioRef.current;
    try {
      if (audioElement) {
        const context = await unlockAudio({
          createAudioContext: () => new AudioContext(),
          audioElement,
          delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
        wireVisibilityResume(context);
      }
    } catch {
      // Silent-mode fallback — see doc comment above.
    } finally {
      setUnlocked(true);
    }
  };

  if (unlocked) return <>{children}</>;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <audio ref={audioRef} src="/audio/unlock-tone.wav" preload="auto" />
      <TapTarget label={COPY.audioUnlock.tapToStart} onActivate={() => void handleTap()}>
        <span style={{ fontSize: "1.5rem" }}>{COPY.audioUnlock.tapToStart}</span>
      </TapTarget>
    </div>
  );
}
