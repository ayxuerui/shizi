import { useEffect, useState } from "react";
import { EnvBadge } from "../components/EnvBadge.js";
import { probeElementPlayback, describeAudioUnlock, describeSharedContext, probeWebAudioPath } from "./capabilities/audio.js";
import { requestPersistence, probeStorage } from "./capabilities/storage.js";
import { describeEnvironment, probeServiceWorker } from "./capabilities/service-worker.js";
import { speakAndObserve, type UtteranceLike } from "./capabilities/speech.js";
import { waitForVoices, selectChineseVoices } from "../audio/voices.js";
import { CRITICAL_PRECACHE_PATHS } from "./critical-assets.js";
import { PenPalmProbe } from "./PenPalmProbe.js";
import { loadStoredReport, saveStoredReport, summarize } from "./report.js";
import { DIAGNOSTICS_FONT_FAMILY, STATUS_COLORS, STATUS_LABELS } from "./theme.js";
import type { CheckResult, DiagnosticsReport, HumanVerdict } from "./types.js";

export interface DiagnosticsScreenProps {
  onExit: () => void;
  /** add-issue-reporting: renders the "Report a problem or idea" button
   * only when provided — opt-in by prop, the same pattern as
   * `AudioUnlockGate`'s `onDiagnosticsRequest`. This screen is the one
   * adult-facing hub reachable at every cold start (via the unlock
   * screen's corner long-press), which is what makes the report form
   * reachable at all from standalone mode. */
  onOpenReport?: () => void;
}

const INITIAL_REPORT: DiagnosticsReport = {
  checks: [],
  verdicts: {},
  context: { standalone: false, legacyIosStandalone: undefined, online: true },
};

function CheckRow({
  check,
  verdict,
  onVerdict,
}: {
  check: CheckResult;
  verdict: HumanVerdict | undefined;
  onVerdict?: (verdict: HumanVerdict) => void;
}) {
  return (
    <div style={{ padding: "0.5rem 0", borderBottom: "1px solid #dcd4c6" }}>
      <span style={{ color: STATUS_COLORS[check.status], fontWeight: 700 }}>[{STATUS_LABELS[check.status]}]</span>{" "}
      <strong>{check.label}</strong>
      <div style={{ fontSize: "0.85rem", color: "#5a5248" }}>{check.detail}</div>
      {onVerdict && (
        <div style={{ marginTop: "0.25rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" onClick={() => onVerdict("confirmed")} disabled={verdict === "confirmed"}>
            I heard/confirmed it
          </button>
          <button type="button" onClick={() => onVerdict("denied")} disabled={verdict === "denied"}>
            No, it did not work
          </button>
          {verdict && verdict !== "unanswered" && <span>→ {verdict}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Task 10.0's pre-flight checklist, made evidence-based instead of
 * guesswork. Parent-facing, English/ASCII labels ONLY — this whole
 * module is out-of-band tooling for a pre-flight check, not a specified
 * learner-facing capability, and any Chinese text here would need a
 * font-subset rebuild for no benefit (see `copy.ts`'s header comment).
 *
 * Never mounted alongside the child-facing tree: `App.tsx` renders
 * EITHER this OR `AudioUnlockGate`/`BoutScreen`, never both — that's what
 * keeps `BoutScreen.test.tsx`'s `assertNoScoreLikeText` guarantee
 * (no digit anywhere in `document.body.textContent`) fully intact; this
 * screen's digits (byte counts, voice counts, timestamps) never enter
 * that tree at all.
 *
 * Every row separates a MACHINE result (`CheckResult`, from the
 * `capabilities/*` probes — evidence a thing fired) from a HUMAN verdict
 * (audibility, intelligibility, whether palm rejection actually held
 * up with a real Pencil) — the machine never infers the latter from the
 * former. Progress is saved to localStorage after each check completes,
 * not only at the end: `vite.config.ts`'s `registerType: "autoUpdate"`
 * means a service-worker update could reload the page mid-run.
 */
export function DiagnosticsScreen({ onExit, onOpenReport }: DiagnosticsScreenProps) {
  // add-issue-reporting: the same value stamped into every issue report
  // (see issues/issue-context.ts) — printed here so a parent can read
  // back which build they're on when filing one.
  const buildId = (import.meta.env.VITE_BUILD_ID as string | undefined) || "unknown";
  const [report, setReport] = useState<DiagnosticsReport>(() => loadStoredReport() ?? INITIAL_REPORT);
  const [persistResult, setPersistResult] = useState<CheckResult | null>(null);

  function upsertCheck(check: CheckResult): void {
    setReport((prev) => {
      const next = { ...prev, checks: [...prev.checks.filter((c) => c.id !== check.id), check] };
      saveStoredReport(next);
      return next;
    });
  }

  function setVerdict(id: string, verdict: HumanVerdict): void {
    setReport((prev) => {
      const next = { ...prev, verdicts: { ...prev.verdicts, [id]: verdict } };
      saveStoredReport(next);
      return next;
    });
  }

  useEffect(() => {
    const legacyStandalone = (window.navigator as { standalone?: boolean }).standalone;
    // jsdom (and conceivably a very old browser) has no matchMedia at all.
    const hasMatchMedia = typeof window.matchMedia === "function";
    const context = describeEnvironment({
      ...(hasMatchMedia ? { matchMedia: (q: string) => window.matchMedia(q) } : {}),
      ...(legacyStandalone !== undefined ? { navigatorStandalone: legacyStandalone } : {}),
      isOnline: () => navigator.onLine,
    });
    setReport((prev) => {
      const next = { ...prev, context };
      saveStoredReport(next);
      return next;
    });
  }, []);

  async function runVoiceCheck(): Promise<void> {
    if (!window.speechSynthesis) {
      upsertCheck({
        id: "speech-voices",
        label: "zh-CN speech voices installed",
        status: "attention",
        detail: "speechSynthesis is not available in this browser.",
        measuredAt: new Date().toISOString(),
      });
      return;
    }
    const voices = await waitForVoices(window.speechSynthesis);
    const chinese = selectChineseVoices(voices);
    upsertCheck({
      id: "speech-voices",
      label: "zh-CN speech voices installed",
      status: chinese.length > 0 ? "ok" : "attention",
      detail:
        chinese.length > 0
          ? `Found ${chinese.length}: ${chinese.map((v) => v.name).join(", ")}`
          : `None found among ${voices.length} total voice(s).`,
      measuredAt: new Date().toISOString(),
    });
  }

  async function runSpeakCheck(): Promise<void> {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const outcome = await speakAndObserve({
      speak: (u) => synth.speak(u as unknown as SpeechSynthesisUtterance),
      cancel: () => synth.cancel(),
      makeUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
      text: "山",
    });
    upsertCheck({
      id: "speech-speak",
      label: "Speech synthesis fires for a target character",
      status: outcome.status === "spoke" ? "ok" : outcome.status === "error" ? "attention" : "unknown",
      detail: JSON.stringify(outcome),
      measuredAt: new Date().toISOString(),
    });
  }

  async function runUnlockToneCheck(): Promise<void> {
    const outcome = await probeElementPlayback({
      createAudio: (url) => new Audio(url),
      url: `${import.meta.env.BASE_URL}audio/unlock-tone.wav`,
    });
    upsertCheck({
      id: "audio-unlock-tone",
      label: "Unlock tone plays via <audio>",
      status: outcome.status === "played" ? "ok" : outcome.status === "failed" ? "attention" : "unknown",
      detail: JSON.stringify(outcome),
      measuredAt: new Date().toISOString(),
    });
  }

  async function runWebAudioCheck(): Promise<void> {
    const shared = describeSharedContext();
    const unlockStatus = describeAudioUnlock();
    if (!shared.created || unlockStatus !== "unlocked") {
      upsertCheck({
        id: "audio-webaudio",
        label: "WebAudio playback path",
        status: "not-run",
        detail: `Only offered after a successful unlock (current: ${unlockStatus}).`,
        measuredAt: new Date().toISOString(),
      });
      return;
    }
    const context = new AudioContext();
    const outcome = await probeWebAudioPath(context, `${import.meta.env.BASE_URL}audio/interaction-cue.wav`);
    upsertCheck({
      id: "audio-webaudio",
      label: "WebAudio playback path",
      status: outcome.status === "played" ? "ok" : "attention",
      detail: JSON.stringify(outcome),
      measuredAt: new Date().toISOString(),
    });
  }

  async function runStorageCheck(): Promise<void> {
    const results = await probeStorage({
      local: window.localStorage,
      storage: navigator.storage,
    });
    for (const result of results) upsertCheck(result);
  }

  async function runServiceWorkerCheck(): Promise<void> {
    const hasServiceWorker = "serviceWorker" in navigator;
    const hasCaches = typeof caches !== "undefined";
    const results = await probeServiceWorker({
      ...(hasServiceWorker ? { serviceWorker: navigator.serviceWorker } : {}),
      ...(hasCaches ? { caches } : {}),
      criticalPaths: CRITICAL_PRECACHE_PATHS,
    });
    for (const result of results) upsertCheck(result);
  }

  async function runPersistRequest(): Promise<void> {
    const result = await requestPersistence(navigator.storage);
    setPersistResult(result);
    upsertCheck(result);
  }

  return (
    <div style={{ fontFamily: DIAGNOSTICS_FONT_FAMILY, padding: "1rem", maxWidth: "640px", margin: "0 auto" }}>
      <EnvBadge />
      <h1 style={{ fontSize: "1.1rem" }}>Diagnostics (task 10.0 pre-flight)</h1>
      {onOpenReport && (
        <p>
          <button type="button" onClick={onOpenReport}>
            Report a problem or idea
          </button>
        </p>
      )}
      <p style={{ fontSize: "0.85rem" }}>
        standalone={String(report.context.standalone)} online={String(report.context.online)}
        {report.context.legacyIosStandalone !== undefined && ` navigator.standalone=${report.context.legacyIosStandalone}`}
        {` build=${buildId}`}
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        {summarize(report.checks).ok} ok, {summarize(report.checks).attention} attention,{" "}
        {summarize(report.checks).unknown} unknown
      </p>

      <section>
        <h2 style={{ fontSize: "1rem" }}>(a) zh-CN speech</h2>
        <button type="button" onClick={() => void runVoiceCheck()}>
          Check voices
        </button>{" "}
        <button type="button" onClick={() => void runSpeakCheck()}>
          Speak a test character
        </button>
        {report.checks
          .filter((c) => c.id.startsWith("speech-"))
          .map((c) => (
            <CheckRow key={c.id} check={c} verdict={report.verdicts[c.id]} onVerdict={(v) => setVerdict(c.id, v)} />
          ))}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem" }}>(b) unlock tone audibility</h2>
        <button type="button" onClick={() => void runUnlockToneCheck()}>
          Play unlock tone
        </button>{" "}
        <button type="button" onClick={() => void runWebAudioCheck()}>
          Play via WebAudio (after unlock)
        </button>
        {report.checks
          .filter((c) => c.id.startsWith("audio-"))
          .map((c) => (
            <CheckRow key={c.id} check={c} verdict={report.verdicts[c.id]} onVerdict={(v) => setVerdict(c.id, v)} />
          ))}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem" }}>(c) pen and palm rejection</h2>
        <PenPalmProbe />
      </section>

      <section>
        <h2 style={{ fontSize: "1rem" }}>(d) offline / storage / standalone</h2>
        <button type="button" onClick={() => void runStorageCheck()}>
          Check storage
        </button>{" "}
        <button type="button" onClick={() => void runServiceWorkerCheck()}>
          Check service worker
        </button>{" "}
        <button type="button" onClick={() => void runPersistRequest()}>
          Request persistent storage
        </button>
        {persistResult && <CheckRow check={persistResult} verdict={undefined} />}
        {report.checks
          .filter((c) => c.id.startsWith("storage-") || c.id.startsWith("sw-"))
          .map((c) => (
            <CheckRow key={c.id} check={c} verdict={report.verdicts[c.id]} />
          ))}
      </section>

      <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", background: "#f0ece4", padding: "0.5rem" }}>
        {JSON.stringify(report, null, 2)}
      </pre>

      <button type="button" onClick={onExit}>
        Exit diagnostics
      </button>
    </div>
  );
}
