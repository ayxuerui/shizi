import { describe, expect, it } from "vitest";
import { selectChineseVoices, waitForVoices, type SpeechSynthesisLike, type VoiceLike } from "./voices.js";

describe("selectChineseVoices", () => {
  it("matches zh-CN, zh_CN (underscore), zh-Hans-CN, and cmn-Hans-CN", () => {
    const voices: VoiceLike[] = [
      { lang: "zh-CN", name: "a" },
      { lang: "zh_CN", name: "b" },
      { lang: "zh-Hans-CN", name: "c" },
      { lang: "cmn-Hans-CN", name: "d" },
      { lang: "en-US", name: "e" },
    ];
    expect(selectChineseVoices(voices).map((v) => v.name)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an empty array when no Chinese voice is present", () => {
    expect(selectChineseVoices([{ lang: "en-US", name: "e" }])).toEqual([]);
  });
});

function fakeSynth(sequence: VoiceLike[][]): SpeechSynthesisLike & { fireVoicesChanged: () => void } {
  let callIndex = 0;
  let handler: (() => void) | undefined;
  return {
    getVoices() {
      const voices = sequence[Math.min(callIndex, sequence.length - 1)]!;
      return voices;
    },
    addEventListener(_type, h) {
      handler = h;
    },
    removeEventListener() {
      handler = undefined;
    },
    fireVoicesChanged() {
      callIndex += 1;
      handler?.();
    },
  };
}

describe("waitForVoices (iOS: getVoices() returns [] on the first synchronous call)", () => {
  it("resolves immediately if voices are already present", async () => {
    const synth = fakeSynth([[{ lang: "zh-CN", name: "a" }]]);
    const voices = await waitForVoices(synth, { now: () => 0 });
    expect(voices).toEqual([{ lang: "zh-CN", name: "a" }]);
  });

  it("resolves via the voiceschanged event once it fires with a non-empty list", async () => {
    const synth = fakeSynth([[], [{ lang: "zh-CN", name: "a" }]]);
    let elapsed = 0;
    const promise = waitForVoices(synth, {
      now: () => elapsed,
      delay: async () => {
        elapsed += 10000; // advance well past the poll interval so the poll loop would also resolve if it ran
      },
    });
    synth.fireVoicesChanged();
    expect(await promise).toEqual([{ lang: "zh-CN", name: "a" }]);
  });

  it("resolves via polling if voiceschanged never fires but getVoices() eventually returns voices", async () => {
    const synth = fakeSynth([[], [], [{ lang: "zh-CN", name: "a" }]]);
    let elapsed = 0;
    let pollCount = 0;
    const voices = await waitForVoices(synth, {
      now: () => elapsed,
      pollMs: 100,
      timeoutMs: 3000,
      delay: async () => {
        pollCount += 1;
        elapsed += 100;
        synth.fireVoicesChanged(); // simulate getVoices() advancing without a real voiceschanged listener mattering
      },
    });
    expect(voices).toEqual([{ lang: "zh-CN", name: "a" }]);
    expect(pollCount).toBeGreaterThan(0);
  });

  it("resolves with an empty list at the timeout — does NOT report unavailable prematurely before that", async () => {
    const synth = fakeSynth([[]]);
    let elapsed = 0;
    const voices = await waitForVoices(synth, {
      now: () => elapsed,
      pollMs: 100,
      timeoutMs: 300,
      delay: async () => {
        elapsed += 100;
      },
    });
    expect(voices).toEqual([]);
    expect(elapsed).toBeGreaterThanOrEqual(300);
  });
});
