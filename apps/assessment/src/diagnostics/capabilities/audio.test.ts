import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAudioUnlockForTests } from "../../audio/audio-unlock.js";
import { __resetSharedAudioContextForTests } from "../../audio/shared-context.js";
import { describeAudioUnlock, describeSharedContext, probeElementPlayback } from "./audio.js";

describe("probeElementPlayback", () => {
  it("reports 'played' once currentTime advances past 0", async () => {
    let elapsed = 0;
    let time = 0;
    const audio = {
      get currentTime() {
        return time;
      },
      set currentTime(v: number) {
        time = v;
      },
      play: vi.fn(async () => {
        time = 0.1; // simulate playback starting
      }),
    };

    const outcome = await probeElementPlayback({
      createAudio: () => audio,
      url: "/audio/unlock-tone.wav",
      now: () => elapsed,
      delay: async () => {
        elapsed += 50;
      },
    });

    expect(outcome.status).toBe("played");
  });

  it("reports 'failed' when play() rejects", async () => {
    const audio = {
      currentTime: 0,
      play: vi.fn(async () => {
        throw new Error("NotAllowedError");
      }),
    };

    const outcome = await probeElementPlayback({ createAudio: () => audio, url: "/x.wav" });

    expect(outcome).toEqual({ status: "failed", reason: "NotAllowedError" });
  });

  it("reports 'no-progress' at the timeout if currentTime never advances", async () => {
    let elapsed = 0;
    const audio = { currentTime: 0, play: vi.fn(async () => {}) };

    const outcome = await probeElementPlayback({
      createAudio: () => audio,
      url: "/x.wav",
      timeoutMs: 100,
      now: () => elapsed,
      delay: async () => {
        elapsed += 50;
      },
    });

    expect(outcome.status).toBe("no-progress");
  });
});

describe("describeSharedContext (peek-only — must never create a context)", () => {
  beforeEach(() => __resetSharedAudioContextForTests());
  afterEach(() => __resetSharedAudioContextForTests());

  it("reports created: false when no context has been created yet", () => {
    expect(describeSharedContext()).toEqual({ created: false });
  });
});

describe("describeAudioUnlock", () => {
  beforeEach(() => __resetAudioUnlockForTests());
  afterEach(() => __resetAudioUnlockForTests());

  it("reports not-attempted before unlockAudio has ever been called", () => {
    expect(describeAudioUnlock()).toBe("not-attempted");
  });
});
