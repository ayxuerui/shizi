import { describe, expect, it } from "vitest";
import { exposureBoutReducer, INITIAL_EXPOSURE_BOUT_STATE } from "./exposure-machine.js";

describe("exposureBoutReducer", () => {
  it("ITEM_READY moves to presenting with the item attached", () => {
    const item = { character: "山", arm: "listen" };
    const state = exposureBoutReducer(INITIAL_EXPOSURE_BOUT_STATE, { type: "ITEM_READY", item });
    expect(state).toEqual({ phase: "presenting", item, completedCount: 0 });
  });

  it("ITEM_COMPLETED clears the item, returns to loading, and increments the count", () => {
    const presenting = exposureBoutReducer(INITIAL_EXPOSURE_BOUT_STATE, {
      type: "ITEM_READY",
      item: { character: "山", arm: "listen" },
    });
    const state = exposureBoutReducer(presenting, { type: "ITEM_COMPLETED" });
    expect(state).toEqual({ phase: "loading", item: null, completedCount: 1 });
  });

  it("SESSION_COMPLETE moves to done with no item", () => {
    const state = exposureBoutReducer(INITIAL_EXPOSURE_BOUT_STATE, { type: "SESSION_COMPLETE" });
    expect(state.phase).toBe("done");
    expect(state.item).toBeNull();
  });
});
