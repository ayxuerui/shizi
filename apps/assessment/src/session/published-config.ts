import type { CandidatePool, CharacterAttributes } from "@shizi/character-data";
import { DEFAULT_ASSESSMENT_SESSION_CONFIG, type AssessmentSessionConfig } from "@shizi/assessment-engine";
import { loadCandidatePool } from "./pool.js";

export interface PublishedConfigResult {
  pool: CandidatePool;
  config: AssessmentSessionConfig;
  source: "published" | "bundled-fallback";
}

interface PublishedDifficultyParams {
  guessDetection: AssessmentSessionConfig["guessDetection"];
  dilution: AssessmentSessionConfig["dilution"];
  calibration: AssessmentSessionConfig["calibration"];
  optionCount: number;
}

interface PublishedConfigShape {
  probePool: Record<string, CharacterAttributes>;
  difficultyParams: PublishedDifficultyParams;
}

function isPublishedConfigShape(value: unknown): value is PublishedConfigShape {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.probePool === "object" &&
    record.probePool !== null &&
    typeof record.difficultyParams === "object" &&
    record.difficultyParams !== null
  );
}

/**
 * Task 9.4's client half: prefers the repo-published `config.json`'s
 * probe pool + difficulty params over the bundled pool. Per design.md's
 * fast/slow-loop principle, even a fast loop's PARAMETERS should come
 * from published config, not a hardcoded default, so tuning after real
 * sessions (design.md's Open Questions) doesn't need a redeploy.
 *
 * `knownSet`/`nextTargets` also exist in the published artifact (see
 * `infra/sync-service/scripts/publish-config.ts`) but are deliberately
 * NOT read here — they're Loop 1 (curriculum's teaching sequencer), a
 * concern for a future consumer (e.g. `printed-reader`), not this
 * app's own frontier-discovery mechanism, which already derives an
 * equivalent signal from local history. Flagged, not silently dropped.
 *
 * Falls back to the existing bundled `loadCandidatePool()`/
 * `DEFAULT_ASSESSMENT_SESSION_CONFIG` on ANY failure (missing file,
 * network error, malformed JSON) — additive, so a first run before
 * `config.json` has ever been published still works. Deliberately NOT
 * used by `useAssessmentSession`/`session/pool.ts` directly — those
 * already have a stable, directly-tested contract (an explicit
 * `pool`/`config` prop); this lives one level up, in `App.tsx`'s own
 * bootstrap, so no existing test needs to change.
 */
export async function loadPublishedConfig(fetchImpl: typeof fetch = fetch): Promise<PublishedConfigResult> {
  try {
    // BASE_URL (Vite's own base-path mechanism, not a hardcoded "/") so this
    // still resolves correctly under the /assessment/ prefix (vite.config.ts).
    const response = await fetchImpl(`${import.meta.env.BASE_URL}config.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const parsed: unknown = await response.json();
    if (!isPublishedConfigShape(parsed)) throw new Error("config.json has an unexpected shape");

    const pool: CandidatePool = new Map(Object.entries(parsed.probePool));
    const config: AssessmentSessionConfig = {
      ...DEFAULT_ASSESSMENT_SESSION_CONFIG,
      guessDetection: parsed.difficultyParams.guessDetection,
      dilution: parsed.difficultyParams.dilution,
      calibration: parsed.difficultyParams.calibration,
      optionCount: parsed.difficultyParams.optionCount,
    };

    return { pool, config, source: "published" };
  } catch {
    return { pool: loadCandidatePool(), config: DEFAULT_ASSESSMENT_SESSION_CONFIG, source: "bundled-fallback" };
  }
}
