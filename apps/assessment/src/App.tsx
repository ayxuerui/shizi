import { useEffect, useState } from "react";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { BoutScreen } from "./bout/BoutScreen.js";
import { DiagnosticsScreen } from "./diagnostics/DiagnosticsScreen.js";
import { clearDiagnosticsHash, isDiagnosticsRequested } from "./diagnostics/entry.js";
import { loadPublishedConfig, type PublishedConfigResult } from "./session/published-config.js";

/**
 * Task 9.4's client half lives here, not inside `BoutScreen`/
 * `useAssessmentSession` — those already have a stable, directly-tested
 * `pool`/`config` prop contract; fetching `config.json` once at the top
 * of the tree and passing the result down keeps that contract additive
 * rather than changing what every existing test constructs.
 */
export function App() {
  const [published, setPublished] = useState<PublishedConfigResult | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(() => isDiagnosticsRequested(window.location));

  useEffect(() => {
    let cancelled = false;
    void loadPublishedConfig().then((result) => {
      if (!cancelled) setPublished(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // This is the app's ONLY URL read (see diagnostics/entry.ts's header
  // comment) — a #diagnostics hash is a dev/desk-testing convenience in
  // ordinary Safari; the corner long-press (AudioUnlockGate's
  // onDiagnosticsRequest below) is the mechanism that also works inside
  // standalone/home-screen mode, where there's no address bar.
  useEffect(() => {
    const onHashChange = (): void => setDiagnosticsOpen(isDiagnosticsRequested(window.location));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  if (diagnosticsOpen) {
    return (
      <DiagnosticsScreen
        onExit={() => {
          clearDiagnosticsHash(window);
          setDiagnosticsOpen(false);
        }}
      />
    );
  }

  if (!published) {
    // Brief — config.json is small and, once fetched once, precached by
    // the service worker like every other public/ asset. Not worth a
    // dedicated loading UI for this.
    return null;
  }

  return (
    <AudioUnlockGate onDiagnosticsRequest={() => setDiagnosticsOpen(true)}>
      <BoutScreen pool={published.pool} config={published.config} />
    </AudioUnlockGate>
  );
}
