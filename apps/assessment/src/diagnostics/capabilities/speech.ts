import type { VoiceLike } from "../../audio/voices.js";

export interface UtteranceLike {
  lang: string;
  voice: VoiceLike | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SpeakDeps {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  /** No `SpeechSynthesisUtterance` constructor in jsdom — always injected. */
  makeUtterance: (text: string) => UtteranceLike;
  text: string;
  lang?: string;
  voice?: VoiceLike;
  timeoutMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}

export type SpeakOutcome =
  | { status: "spoke"; startedAfterMs: number; endedAfterMs: number }
  | { status: "no-start"; waitedMs: number }
  | { status: "error"; error: string };

/**
 * Wires `onstart`/`onend`/`onerror` — observability `narration.ts`'s
 * `speak()` has none of. This proves synthesis actually fired; it is NOT
 * evidence of audibility (see `types.ts`'s `HumanVerdict` — that's a
 * human ear's job, asked separately in `DiagnosticsScreen.tsx`).
 */
export async function speakAndObserve(deps: SpeakDeps): Promise<SpeakOutcome> {
  const timeoutMs = deps.timeoutMs ?? 4000;
  const now = deps.now ?? (() => Date.now());
  const delay = deps.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const utterance = deps.makeUtterance(deps.text);
  utterance.lang = deps.lang ?? "zh-CN";
  if (deps.voice) utterance.voice = deps.voice;

  return new Promise<SpeakOutcome>((resolve) => {
    let settled = false;
    let startedAt: number | null = null;
    const startTime = now();

    const finish = (outcome: SpeakOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    utterance.onstart = () => {
      startedAt = now();
    };
    utterance.onend = () => {
      finish(
        startedAt === null
          ? { status: "no-start", waitedMs: now() - startTime }
          : { status: "spoke", startedAfterMs: startedAt - startTime, endedAfterMs: now() - startTime },
      );
    };
    utterance.onerror = () => {
      finish({ status: "error", error: "speechSynthesis reported an error" });
    };

    deps.cancel();
    deps.speak(utterance);

    void (async () => {
      await delay(timeoutMs);
      finish({ status: "no-start", waitedMs: now() - startTime });
    })();
  });
}
