import { beatForIndex } from "./beats.js";
import { WukongPlaceholder } from "./WukongPlaceholder.js";

export interface NarrativeStageProps {
  beatIndex: number;
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
 */
export function NarrativeStage({ beatIndex }: NarrativeStageProps) {
  const beat = beatForIndex(beatIndex);
  const reachedCount = Math.min(beatIndex, STONE_COUNT);

  return (
    <div style={{ textAlign: "center", padding: "1rem" }}>
      <WukongPlaceholder />
      <p style={{ fontSize: "1.25rem" }}>{beat.goal}</p>
      <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }} data-testid="beat-progress">
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
  );
}
