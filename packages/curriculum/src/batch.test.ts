import { describe, expect, it } from "vitest";
import { assembleCandidatePool, buildConfusabilityIndex, computeConfusability, PHASE_A_SEQUENCE } from "@shizi/character-data";
import { composeBatch, composeBatchPlan } from "./batch.js";
import { DEFAULT_CURRICULUM_CONFIG } from "./types.js";
import type { CurriculumState } from "./types.js";

const pool = assembleCandidatePool();
const confusabilityIndex = buildConfusabilityIndex(computeConfusability(pool));

function state(overrides: Partial<CurriculumState> = {}): CurriculumState {
  return { knownSet: new Set(), recentlyIntroduced: [], ...overrides };
}

/** Masks every character except the given ones back to "untagged" (mirrors
 * select.test.ts's withOneUsableCandidate) so phase-b batch composition has
 * a small, fully controlled candidate set instead of the ~200-character
 * real pool competing on score. */
function withUsableCandidates(characters: readonly string[]): typeof pool {
  const modified = new Map(pool);
  for (const [key, entry] of modified) {
    modified.set(
      key,
      characters.includes(key)
        ? { ...entry, concreteness: "concrete", pictographic: false, tagSource: "reviewed" }
        : { ...entry, concreteness: null, pictographic: null, tagSource: null },
    );
  }
  return modified;
}

describe("composeBatch (add-batched-curriculum-tagging spec: batch composition)", () => {
  it("fills a batch from Phase A in its authored order", () => {
    const batch = composeBatch(pool, state(), confusabilityIndex);
    expect(batch.characters).toHaveLength(6); // add-batch-scoped-activities: default batchSize is 6
    expect(batch.characters).toEqual(PHASE_A_SEQUENCE.slice(0, DEFAULT_CURRICULUM_CONFIG.batchSize));
    expect(batch.short).toBe(false);
  });

  it("a batch can span the Phase A boundary into phase-b", () => {
    // Know all but the last Phase A character; only 1 Phase A slot left,
    // so a 5-wide batch needs 4 phase-b picks to fill out.
    const almostAllPhaseA = new Set(PHASE_A_SEQUENCE.slice(0, -1));
    const usablePool = withUsableCandidates(["谢", "写", "认", "读"]);
    const batch = composeBatch(usablePool, state({ knownSet: almostAllPhaseA }), confusabilityIndex);
    expect(batch.characters[0]).toBe(PHASE_A_SEQUENCE.at(-1));
    expect(batch.characters.length).toBeGreaterThan(1);
  });

  it("no two members of one batch are confusable with each other (batchSize === recentWindowSize)", () => {
    const fakeConfusabilityIndex = new Map([
      ["谢", new Set(["写"])],
      ["写", new Set(["谢"])],
    ]);
    const usablePool = withUsableCandidates(["谢", "写", "认", "读", "说"]);
    const batch = composeBatch(
      usablePool,
      state({ knownSet: new Set(PHASE_A_SEQUENCE) }),
      fakeConfusabilityIndex,
    );
    // 写 is confusable with 谢 — since both are candidates, only one may appear.
    expect(batch.characters).not.toEqual(expect.arrayContaining(["谢", "写"]));
  });

  it("excludes a candidate confusable with an already-picked batch member even once it has fallen outside the recent window (add-batch-scoped-activities design decision 1)", () => {
    const fakeConfusabilityIndex = new Map([
      ["谢", new Set(["读"])],
      ["读", new Set(["谢"])],
    ]);
    const usablePool = withUsableCandidates(["谢", "写", "认", "读"]);
    const batch = composeBatch(
      usablePool,
      state({ knownSet: new Set(PHASE_A_SEQUENCE) }),
      fakeConfusabilityIndex,
      // recentWindowSize 1 means by the time a 3rd or 4th character is
      // picked, the 1st pick has long since fallen out of the window —
      // yet 谢/读 must still never coexist in the batch.
      { ...DEFAULT_CURRICULUM_CONFIG, batchSize: 4, recentWindowSize: 1 },
    );
    expect(batch.characters).not.toEqual(expect.arrayContaining(["谢", "读"]));
  });

  it("holds when batchSize exceeds recentWindowSize (evaporates silently at 7 without the explicit constraint — design.md)", () => {
    const sevenCandidates = ["爱", "八", "爸", "白", "帮", "杯", "病"];
    const fakeConfusabilityIndex = new Map([
      ["爱", new Set(["病"])],
      ["病", new Set(["爱"])],
    ]);
    const usablePool = withUsableCandidates(sevenCandidates);
    const batch = composeBatch(
      usablePool,
      state({ knownSet: new Set(PHASE_A_SEQUENCE) }),
      fakeConfusabilityIndex,
      // With recentWindowSize 5, picking a 7th character sees only the
      // last 5 predecessors — the 1st pick is no longer in the window.
      // The explicit pickedInBatch constraint is what still excludes it.
      { ...DEFAULT_CURRICULUM_CONFIG, batchSize: 7, recentWindowSize: 5 },
    );
    expect(batch.characters).not.toEqual(expect.arrayContaining(["爱", "病"]));
    // Only 6 of the 7 usable candidates are mutually compatible (one of
    // 爱/病 must be excluded), so the 7th slot has nothing eligible left.
    expect(batch.characters).toHaveLength(6);
    expect(batch.short).toBe(true);
  });

  it("returns a short batch, with a reason, instead of violating spacing", () => {
    const usablePool = withUsableCandidates(["谢"]); // only one usable phase-b candidate exists
    const batch = composeBatch(usablePool, state({ knownSet: new Set(PHASE_A_SEQUENCE) }), confusabilityIndex);
    expect(batch.characters).toEqual(["谢"]);
    expect(batch.short).toBe(true);
    expect(batch.reason).toBeTruthy();
  });

  it("honors a reconfigured batchSize", () => {
    const batch = composeBatch(pool, state(), confusabilityIndex, { ...DEFAULT_CURRICULUM_CONFIG, batchSize: 3 });
    expect(batch.characters).toEqual(PHASE_A_SEQUENCE.slice(0, 3));
  });

  it("is deterministic across two identical runs", () => {
    const usablePool = withUsableCandidates(["谢", "写", "认", "读"]);
    const s = state({ knownSet: new Set(PHASE_A_SEQUENCE) });
    expect(composeBatch(usablePool, s, confusabilityIndex)).toEqual(composeBatch(usablePool, s, confusabilityIndex));
  });
});

describe("composeBatchPlan", () => {
  it("plans batchLookahead consecutive batches, excluding characters already placed in earlier batches", () => {
    const plan = composeBatchPlan(pool, state(), confusabilityIndex, { ...DEFAULT_CURRICULUM_CONFIG, batchLookahead: 2 });
    expect(plan).toHaveLength(2);
    expect(plan[0]!.characters).toEqual(PHASE_A_SEQUENCE.slice(0, DEFAULT_CURRICULUM_CONFIG.batchSize));
    expect(plan[1]!.characters).toEqual(
      PHASE_A_SEQUENCE.slice(DEFAULT_CURRICULUM_CONFIG.batchSize, DEFAULT_CURRICULUM_CONFIG.batchSize * 2),
    );
    const allCharacters = plan.flatMap((batch) => batch.characters);
    expect(new Set(allCharacters).size).toBe(allCharacters.length); // no repeats across batches
  });

  it("is deterministic across two identical runs", () => {
    const s = state();
    expect(composeBatchPlan(pool, s, confusabilityIndex)).toEqual(composeBatchPlan(pool, s, confusabilityIndex));
  });

  it("spans the Phase A boundary as four full batches plus one short batch (25 characters ÷ batchSize 6)", () => {
    // Mask every non-Phase-A candidate unusable, so once Phase A's 25
    // characters are exhausted, Phase B has nothing left to draw from —
    // isolating the boundary itself rather than spilling into the real
    // ~200-character pool's phase-b candidates.
    const phaseAOnlyPool = withUsableCandidates(PHASE_A_SEQUENCE);
    const plan = composeBatchPlan(phaseAOnlyPool, state(), confusabilityIndex, {
      ...DEFAULT_CURRICULUM_CONFIG,
      batchLookahead: 5,
    });
    expect(plan).toHaveLength(5);
    expect(plan.slice(0, 4).map((batch) => [batch.characters.length, batch.short])).toEqual([
      [6, false],
      [6, false],
      [6, false],
      [6, false],
    ]);
    expect(plan[4]!.characters).toHaveLength(1);
    expect(plan[4]!.short).toBe(true);
    expect(plan.flatMap((batch) => batch.characters)).toEqual(PHASE_A_SEQUENCE);
  });
});
