import { describe, expect, it } from "vitest";
import { computeKnownSet } from "./known-set-projection.js";
import type { MasteryState } from "./types.js";

describe("computeKnownSet", () => {
  it("includes known characters", () => {
    const states = new Map<string, MasteryState>([["山", "known"]]);
    expect(computeKnownSet(states)).toEqual(new Set(["山"]));
  });

  it("includes shaky characters (interpretation: shaky is 'known but due for review', not 'not known' — see code comment)", () => {
    const states = new Map<string, MasteryState>([["山", "shaky"]]);
    expect(computeKnownSet(states)).toEqual(new Set(["山"]));
  });

  it("excludes probing and unseen characters", () => {
    const states = new Map<string, MasteryState>([
      ["山", "probing"],
      ["水", "unseen"],
    ]);
    expect(computeKnownSet(states)).toEqual(new Set());
  });
});
