import { useEffect, useState } from "react";
import type { AssessmentSessionConfig } from "@shizi/assessment-engine";
import type { CandidatePool } from "@shizi/character-data";
import { BoutScreen } from "../bout/BoutScreen.js";
import { ExposureScreen } from "../exposure/ExposureScreen.js";
import { MemoryScreen } from "../memory/MemoryScreen.js";
import { loadPriorEvents } from "../offline/event-queue.js";
import { decideActivity, type ActivityDecision } from "./activity-selector.js";

const LAST_MEMORY_BOUT_DATE_KEY = "shizi:lastMemoryBoutDate";

function todayLocalDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readLastMemoryBoutDate(): string | null {
  try {
    return window.localStorage.getItem(LAST_MEMORY_BOUT_DATE_KEY);
  } catch {
    return null; // private-browsing/storage-disabled — memory just runs every session instead of once/day.
  }
}

function writeLastMemoryBoutDate(date: string): void {
  try {
    window.localStorage.setItem(LAST_MEMORY_BOUT_DATE_KEY, date);
  } catch {
    // Best-effort only — a failed write just means today's memory bout
    // might run again later today; never worth surfacing to the child.
  }
}

export interface PracticeRouterProps {
  pool: CandidatePool;
  assessmentConfig: AssessmentSessionConfig;
}

/**
 * The top-level activity chooser (`add-tracing-modality-arm` task 6.5:
 * "a post-unlock activity chooser ... so `AudioUnlockGate` can lead to
 * either `ExposureScreen` or `BoutScreen` instead of only `BoutScreen`"),
 * extended to a full learn → assess → daily-memory cycle per batch — see
 * `activity-selector.ts`'s doc comment for why no spec names this
 * rotation yet.
 *
 * Recomputes which activity to run every time the previous one finishes
 * (via a `generation` bump forcing a fresh mount under a new `key`),
 * always against this device's current local event history — a live
 * projection, exactly like every other derived-state read in this
 * project, never separately tracked "which activity comes next" state.
 * This is also the fix for "she can only play a few bouts and then
 * nothing happens": before this component existed, `App.tsx` mounted
 * exactly one `BoutScreen` for the app's entire lifetime, with no way to
 * reach a second bout, let alone teach a new character.
 */
export function PracticeRouter({ pool, assessmentConfig }: PracticeRouterProps) {
  const [decision, setDecision] = useState<ActivityDecision | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadPriorEvents().then((events) => {
      if (cancelled) return;
      setDecision(
        decideActivity({
          pool,
          events,
          today: todayLocalDate(),
          lastMemoryBoutDate: readLastMemoryBoutDate(),
        }),
      );
    });
    return () => {
      cancelled = true;
    };
    // `generation` is a dependency deliberately, even though its value is
    // otherwise unused here — bumping it is what triggers recomputing the
    // decision against fresh event history once the prior activity wrote
    // its events to the offline queue.
  }, [pool, generation]);

  function advance(justFinished: ActivityDecision): void {
    if (justFinished.type === "memory") {
      writeLastMemoryBoutDate(todayLocalDate());
    }
    setDecision(null);
    setGeneration((g) => g + 1);
  }

  if (!decision) return null; // brief — loading local history, same discipline as App.tsx's config fetch.

  const key = `${decision.type}-${generation}`;

  if (decision.type === "learn") {
    return (
      <ExposureScreen key={key} pool={pool} characters={decision.characters} onDone={() => advance(decision)} />
    );
  }
  if (decision.type === "memory") {
    return <MemoryScreen key={key} pool={pool} characters={decision.characters} onDone={() => advance(decision)} />;
  }
  return <BoutScreen key={key} pool={pool} config={assessmentConfig} onDone={() => advance(decision)} />;
}
