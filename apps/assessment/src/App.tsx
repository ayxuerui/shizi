import { useEffect, useState } from "react";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { DiagnosticsScreen } from "./diagnostics/DiagnosticsScreen.js";
import { clearParentScreenHash, requestedParentScreen, type ParentScreen } from "./diagnostics/entry.js";
import { IssueReportScreen } from "./issues/IssueReportScreen.js";
import { PracticeRouter } from "./session/PracticeRouter.js";
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
  // add-issue-reporting: EITHER of two adult-facing screens, OR the child's
  // tree — never more than one at a time (see the either/or note below).
  const [parentScreen, setParentScreen] = useState<ParentScreen | null>(() =>
    requestedParentScreen(window.location),
  );

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
  // comment) — a #diagnostics / #report hash is a dev/desk-testing
  // convenience in ordinary Safari; the corner long-press (AudioUnlockGate's
  // onDiagnosticsRequest below) is the mechanism that also works inside
  // standalone/home-screen mode, where there's no address bar — and the
  // diagnostics screen's own button is how the report form is reached
  // from there.
  useEffect(() => {
    const onHashChange = (): void => setParentScreen(requestedParentScreen(window.location));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const exitParentScreen = (): void => {
    clearParentScreenHash(window);
    setParentScreen(null);
  };

  // Either/or, never both: an adult-facing screen replaces the child's
  // whole tree, which is what keeps BoutScreen.test.tsx's
  // assertNoScoreLikeText guarantee structural — neither screen's digits
  // can ever be in the DOM alongside a bout.
  if (parentScreen === "report") {
    return <IssueReportScreen onExit={exitParentScreen} />;
  }

  if (parentScreen === "diagnostics") {
    return <DiagnosticsScreen onExit={exitParentScreen} onOpenReport={() => setParentScreen("report")} />;
  }

  if (!published) {
    // Brief — config.json is small and, once fetched once, precached by
    // the service worker like every other public/ asset. Not worth a
    // dedicated loading UI for this.
    return null;
  }

  return (
    <AudioUnlockGate onDiagnosticsRequest={() => setParentScreen("diagnostics")}>
      <PracticeRouter pool={published.pool} assessmentConfig={published.config} />
    </AudioUnlockGate>
  );
}
