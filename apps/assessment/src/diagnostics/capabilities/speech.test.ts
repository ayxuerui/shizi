import { describe, expect, it } from "vitest";
import { speakAndObserve, type UtteranceLike } from "./speech.js";

function fakeUtterance(): UtteranceLike {
  return { lang: "", voice: null, onstart: null, onend: null, onerror: null };
}

describe("speakAndObserve (narration.ts has no onstart/onend/onerror wiring today — this adds it)", () => {
  it("reports 'spoke' when onstart then onend both fire", async () => {
    let elapsed = 0;
    const utterance = fakeUtterance();
    const outcome = await speakAndObserve({
      speak: (u) => {
        Object.assign(utterance, u);
        queueMicrotask(() => {
          utterance.onstart?.();
          elapsed += 50;
          utterance.onend?.();
        });
      },
      cancel: () => {},
      makeUtterance: () => utterance,
      text: "山",
      now: () => elapsed,
      delay: async () => {
        elapsed += 100000; // ensure the timeout branch never wins the race in this test
      },
    });
    expect(outcome.status).toBe("spoke");
  });

  it("reports 'error' when onerror fires", async () => {
    const utterance = fakeUtterance();
    const outcome = await speakAndObserve({
      speak: (u) => {
        Object.assign(utterance, u);
        queueMicrotask(() => utterance.onerror?.());
      },
      cancel: () => {},
      makeUtterance: () => utterance,
      text: "山",
      delay: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100000));
      },
    });
    expect(outcome.status).toBe("error");
  });

  it("reports 'no-start' at the timeout when nothing fires at all", async () => {
    const utterance = fakeUtterance();
    const outcome = await speakAndObserve({
      speak: (u) => {
        Object.assign(utterance, u);
        // deliberately never call onstart/onend/onerror
      },
      cancel: () => {},
      makeUtterance: () => utterance,
      text: "山",
      timeoutMs: 10,
      delay: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    expect(outcome.status).toBe("no-start");
  });

  it("reports 'no-start' if onstart fires but onend never does, once the timeout elapses", async () => {
    const utterance = fakeUtterance();
    const outcome = await speakAndObserve({
      speak: (u) => {
        Object.assign(utterance, u);
        queueMicrotask(() => utterance.onstart?.());
      },
      cancel: () => {},
      makeUtterance: () => utterance,
      text: "山",
      timeoutMs: 10,
      delay: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    expect(outcome.status).toBe("no-start");
  });

  it("calls cancel() before speak(), matching narration.ts's own 'don't stack repeated taps' discipline", async () => {
    const calls: string[] = [];
    const utterance = fakeUtterance();
    await speakAndObserve({
      speak: (u) => {
        calls.push("speak");
        Object.assign(utterance, u);
        queueMicrotask(() => {
          utterance.onstart?.();
          utterance.onend?.();
        });
      },
      cancel: () => calls.push("cancel"),
      makeUtterance: () => utterance,
      text: "山",
      delay: async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });
    expect(calls).toEqual(["cancel", "speak"]);
  });
});
