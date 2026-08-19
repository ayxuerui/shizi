import { useEffect, useState } from "react";
import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { BoutScreen } from "./bout/BoutScreen.js";
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

  useEffect(() => {
    let cancelled = false;
    void loadPublishedConfig().then((result) => {
      if (!cancelled) setPublished(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!published) {
    // Brief — config.json is small and, once fetched once, precached by
    // the service worker like every other public/ asset. Not worth a
    // dedicated loading UI for this.
    return null;
  }

  return (
    <AudioUnlockGate>
      <BoutScreen pool={published.pool} config={published.config} />
    </AudioUnlockGate>
  );
}
