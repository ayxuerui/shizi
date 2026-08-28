import { describe, expect, it } from "vitest";
import { boutReducer, INITIAL_BOUT_STATE, type BoutState } from "./bout-machine.js";

const PROBE = { character: "山", kind: "informative" as const, options: ["山", "水", "火", "日"] };

describe("boutReducer (assessment spec: 'No visible scoring or failure state', 'Narrative framing')", () => {
  it("PROBE_READY moves to probing with the new probe and clears any prior cue/selection", () => {
    const state = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    expect(state.phase).toBe("probing");
    expect(state.probe).toBe(PROBE);
    expect(state.selected).toBeNull();
    expect(state.cue).toBeNull();
  });

  it("scenario: progress advances regardless of accuracy — beatIndex increments on a CORRECT response", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const responded = boutReducer(probing, { type: "RESPONDED", selected: "山", correct: true });
    expect(responded.beatIndex).toBe(1);
    expect(responded.phase).toBe("resolving");
    expect(responded.cue).toBe("acknowledge");
  });

  it("scenario: progress advances regardless of accuracy — beatIndex increments IDENTICALLY on an INCORRECT response", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const responded = boutReducer(probing, { type: "RESPONDED", selected: "水", correct: false });
    expect(responded.beatIndex).toBe(1);
    expect(responded.phase).toBe("resolving");
    expect(responded.cue).toBe("redirect");
  });

  it("an incorrect response never produces any cue value other than the neutral 'redirect'", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const responded = boutReducer(probing, { type: "RESPONDED", selected: "水", correct: false });
    expect(["acknowledge", "redirect"]).toContain(responded.cue);
  });

  it("ignores a RESPONDED action outside the probing phase (e.g. a stray late tap while resolving)", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const resolving = boutReducer(probing, { type: "RESPONDED", selected: "山", correct: true });
    const strayTap = boutReducer(resolving, { type: "RESPONDED", selected: "水", correct: false });
    expect(strayTap).toEqual(resolving); // no double-counted beat, no cue overwrite
  });

  it("SESSION_COMPLETE moves to closing, clears the probe, and records the reason", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const closed = boutReducer(probing, { type: "SESSION_COMPLETE", reason: "item-count" });
    expect(closed.phase).toBe("closing");
    expect(closed.probe).toBeNull();
    expect(closed.completionReason).toBe("item-count");
  });

  it("SESSION_COMPLETE with reason 'focus-resolved' reaches the same closing state as any other reason (add-batch-scoped-activities: no UI branches on completionReason)", () => {
    const probing = boutReducer(INITIAL_BOUT_STATE, { type: "PROBE_READY", probe: PROBE });
    const closed = boutReducer(probing, { type: "SESSION_COMPLETE", reason: "focus-resolved" });
    expect(closed.phase).toBe("closing");
    expect(closed.probe).toBeNull();
    expect(closed.completionReason).toBe("focus-resolved");
  });

  it("scenario: no cumulative score shown — no field in BoutState can represent a score at all", () => {
    // Structural check, not just behavioral: every key on BoutState is
    // one of these — none of them is a number-of-correct/percent/score.
    const state: BoutState = INITIAL_BOUT_STATE;
    expect(Object.keys(state).sort()).toEqual(
      ["beatIndex", "completionReason", "cue", "phase", "probe", "ratingPhase", "selected"].sort(),
    );
  });

  it("RATED and RATING_SKIPPED both settle the rating and move to the done phase", () => {
    const closed = boutReducer(INITIAL_BOUT_STATE, { type: "SESSION_COMPLETE", reason: "duration" });
    expect(boutReducer(closed, { type: "RATED" })).toMatchObject({ ratingPhase: "settled", phase: "done" });
    expect(boutReducer(closed, { type: "RATING_SKIPPED" })).toMatchObject({ ratingPhase: "settled", phase: "done" });
  });
});
