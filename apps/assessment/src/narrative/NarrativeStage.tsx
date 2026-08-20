import { beatForIndex } from "./beats.js";
import { JourneyTrail } from "./JourneyTrail.js";
import { WukongPlaceholder } from "./WukongPlaceholder.js";
import type { SessionTiming } from "../session/use-assessment-session.js";

export interface NarrativeStageProps {
  beatIndex: number;
  /** Optional: when provided, renders the `JourneyTrail` cue behind the
   * stones. Omitted entirely when absent, so this component renders
   * exactly as before for any caller (including existing tests) that
   * only passes `beatIndex`. */
  timing?: SessionTiming;
  /** Whether the bout has reached its closing beat — forces the trail to
   * exactly 100% regardless of which bound (duration or item-count)
   * actually fired. See `journey-progress.ts`. */
  complete?: boolean;
}

const STONE_COUNT = 6;

/**
 * Per `assessment` spec's "Narrative framing" requirement: goal text +
 * placeholder art + a path of stones marked by `beatIndex`. The stones
 * encode BEATS ELAPSED, never correctness — capped, not conditional on
 * outcome, so it is structurally identical whether the last few
 * responses were right or wrong. See boutReducer's "Progress advances
 * regardless of accuracy" comment for the state-side half of this
 * guarantee.
 *
 * When `timing` is provided, a second, additive channel renders behind
 * the stones: a thin, continuously-filling trail reflecting how close
 * the bout is to ending overall (see `JourneyTrail`/`journey-progress.ts`
 * — non-numeric, `--color-accent` only, fills but never drains). The
 * stones themselves are unchanged by this — they still mean exactly
 * "beats elapsed," nothing more; the trail is a separate, honest answer
 * to "how much of this bout is left" for the cases (a long duration-
 * bounded bout) where the stones alone saturate long before the bout is
 * actually close to done.
 */
export function NarrativeStage({ beatIndex, timing, complete = false }: NarrativeStageProps) {
  const beat = beatForIndex(beatIndex);
  const reachedCount = Math.min(beatIndex, STONE_COUNT);

  return (
    <div style={{ textAlign: "center", padding: "1rem" }}>
      <WukongPlaceholder />
      <p style={{ fontSize: "1.25rem" }}>{beat.goal}</p>
      <div style={{ position: "relative" }}>
        {timing && <JourneyTrail timing={timing} beatIndex={beatIndex} complete={complete} />}
        <div
          style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", gap: "0.5rem" }}
          data-testid="beat-progress"
        >
          {Array.from({ length: STONE_COUNT }, (_, i) => (
            <span
              key={i}
              data-testid={`stone-${i}`}
              style={{
                display: "inline-block",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: i < reachedCount ? "var(--color-accent)" : "var(--color-surface)",
                border: "2px solid var(--color-accent)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
