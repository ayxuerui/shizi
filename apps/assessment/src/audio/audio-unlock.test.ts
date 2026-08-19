import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAudioUnlockForTests, unlockAudio } from "./audio-unlock.js";
import { __resetSharedAudioContextForTests } from "./shared-context.js";

function fakeAudioContext(initialState: AudioContextState = "suspended") {
  let state = initialState;
  return {
    get state() {
      return state;
    },
    resume: vi.fn(async () => {
      state = "running";
    }),
  } as unknown as AudioContext;
}

describe("unlockAudio (design.md: 'Audio unlock requires an HTMLMediaElement, not just AudioContext.resume()')", () => {
  beforeEach(() => {
    __resetAudioUnlockForTests();
    __resetSharedAudioContextForTests();
  });

  it("plays the HTMLAudioElement clip before resuming the AudioContext", async () => {
    const order: string[] = [];
    const context = fakeAudioContext();
    context.resume = vi.fn(async () => {
      order.push("resume");
    });
    const audioElement = {
      currentTime: 5,
      play: vi.fn(async () => {
        order.push("play");
      }),
    };
    const delay = vi.fn(async () => {
      order.push("delay");
    });

    await unlockAudio({ createAudioContext: () => context, audioElement, delay });

    expect(order).toEqual(["play", "resume", "delay"]);
  });

  it("resets currentTime to 0 before playing, so a repeat tap replays from the start", async () => {
    const audioElement = { currentTime: 7, play: vi.fn(async () => {}) };
    await unlockAudio({
      createAudioContext: () => fakeAudioContext(),
      audioElement,
      delay: async () => {},
    });
    expect(audioElement.currentTime).toBe(0);
  });

  it("only resumes the context if it's suspended", async () => {
    const context = fakeAudioContext("running");
    const resume = vi.fn(async () => {});
    (context as unknown as { resume: typeof resume }).resume = resume;

    await unlockAudio({
      createAudioContext: () => context,
      audioElement: { currentTime: 0, play: vi.fn(async () => {}) },
      delay: async () => {},
    });

    expect(resume).not.toHaveBeenCalled();
  });

  it("is memoized — a second call does not replay the clip or re-resume", async () => {
    const play = vi.fn(async () => {});
    const context = fakeAudioContext();
    const deps = {
      createAudioContext: () => context,
      audioElement: { currentTime: 0, play },
      delay: async () => {},
    };

    const first = await unlockAudio(deps);
    const second = await unlockAudio(deps);

    expect(play).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("returns the shared AudioContext", async () => {
    const context = fakeAudioContext();
    const result = await unlockAudio({
      createAudioContext: () => context,
      audioElement: { currentTime: 0, play: vi.fn(async () => {}) },
      delay: async () => {},
    });
    expect(result).toBe(context);
  });
});
