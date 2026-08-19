import { describe, expect, it } from "vitest";
import { assembleCandidatePool } from "@shizi/character-data";
import { computeMasteryStates, exportToJsonl, parseJsonl, validateEvent } from "@shizi/learner-state";
import type { AssessmentSessionConfig, SessionDeps } from "./types.js";
import { DEFAULT_ASSESSMENT_SESSION_CONFIG } from "./types.js";
import { AssessmentSession } from "./session.js";
import { computeDifficultyIndex } from "./difficulty.js";

const pool = assembleCandidatePool();

/** Deterministic PRNG (mulberry32) — same algorithm shape used across
 * this repo's other injected-randomness tests; avoids Math.random so
 * shuffled option order is reproducible run to run. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh, fully-deterministic deps — every counter restarts at 0 so two
 * independent sessions built from separate calls produce identical
 * output given identical scripted responses (see the determinism test). */
function makeDeps(): SessionDeps {
  let wallClockMs = 0;
  let elapsed = 0;
  let idCounter = 0;
  return {
    now: () => {
      wallClockMs += 2000;
      return new Date(wallClockMs).toISOString();
    },
    elapsedMs: () => {
      elapsed += 2000;
      return elapsed;
    },
    timeOfDay: () => 10,
    random: makeRandom(42),
    newId: () => `evt-${idCounter++}`,
  };
}

describe("AssessmentSession — probe/response contract", () => {
  it("throws if recordResponse is called with no outstanding probe", () => {
    const session = new AssessmentSession({ sessionId: "s1", pool, deps: makeDeps() });
    expect(() =>
      session.recordResponse({ character: "山", outcome: "correct", latencyMs: 500, adultPresent: true }),
    ).toThrow();
  });

  it("throws if recordResponse's character doesn't match the outstanding probe", () => {
    const session = new AssessmentSession({ sessionId: "s1", pool, deps: makeDeps() });
    const next = session.nextProbe();
    if (next.status !== "probe") throw new Error("expected a probe");
    const wrongCharacter = next.probe.character === "山" ? "水" : "山";
    expect(() =>
      session.recordResponse({ character: wrongCharacter, outcome: "correct", latencyMs: 500, adultPresent: true }),
    ).toThrow();
  });

  it("every probe's option set includes the target and is sized to optionCount", () => {
    const session = new AssessmentSession({ sessionId: "s1", pool, deps: makeDeps() });
    const next = session.nextProbe();
    if (next.status !== "probe") throw new Error("expected a probe");
    expect(next.probe.options).toContain(next.probe.character);
    expect(next.probe.options).toHaveLength(DEFAULT_ASSESSMENT_SESSION_CONFIG.optionCount);
  });
});

describe("AssessmentSession — session bounding (task 8.10, assessment spec: 'Bounded session length')", () => {
  it("scenario: session reaches its item-count bound and concludes", () => {
    const config: AssessmentSessionConfig = { ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxItems: 3 };
    const session = new AssessmentSession({ sessionId: "s1", pool, config, deps: makeDeps() });
    for (let i = 0; i < 3; i++) {
      const next = session.nextProbe();
      expect(next.status).toBe("probe");
      if (next.status !== "probe") continue;
      session.recordResponse({ character: next.probe.character, outcome: "correct", latencyMs: 500, adultPresent: true });
    }
    expect(session.nextProbe()).toEqual({ status: "session-complete", reason: "item-count" });
  });

  it("scenario: session reaches its duration bound and concludes", () => {
    const config: AssessmentSessionConfig = { ...DEFAULT_ASSESSMENT_SESSION_CONFIG, maxDurationMs: 1000 };
    // elapsedMs advances 2000ms per call — the very first bound check already exceeds 1000ms.
    const session = new AssessmentSession({ sessionId: "s1", pool, config, deps: makeDeps() });
    expect(session.nextProbe()).toEqual({ status: "session-complete", reason: "duration" });
  });
});

describe("AssessmentSession — guess-detection-to-mastery wiring (task 8.5, reuses learner-state's computeMasteryStates)", () => {
  it("two consecutive fast-correct responses to the same character mark it known, mirroring computeMasteryStates directly", () => {
    const session = new AssessmentSession({
      sessionId: "s1",
      pool,
      config: { ...DEFAULT_ASSESSMENT_SESSION_CONFIG, dilution: { easyPerInformative: 0 } }, // every slot informative — simplest to drive a specific character repeatedly isn't guaranteed, so respond to whatever's served
      deps: makeDeps(),
    });

    let lastCharacter = "";
    let lastResult;
    // Probe repeatedly, always answering fast-correct, until some
    // character reaches "known" via two consecutive fast-correct hits.
    for (let i = 0; i < 40; i++) {
      const next = session.nextProbe();
      if (next.status !== "probe") break;
      lastCharacter = next.probe.character;
      lastResult = session.recordResponse({
        character: next.probe.character,
        outcome: "correct",
        latencyMs: 100,
        adultPresent: true,
      });
      if (lastResult.masteryState === "known") break;
    }

    expect(lastResult!.masteryState).toBe("known");
    const projected = computeMasteryStates(session.getEvents()).get(lastCharacter);
    expect(projected).toBe("known");
  });
});

describe("AssessmentSession — matched-pair assignment wiring (task 8.13)", () => {
  it("records an assignment before any response is known, on a character's first-ever informative exposure", () => {
    const session = new AssessmentSession({
      sessionId: "s1",
      pool,
      config: { ...DEFAULT_ASSESSMENT_SESSION_CONFIG, dilution: { easyPerInformative: 0 } },
      deps: makeDeps(),
    });

    expect(session.getAssignments()).toHaveLength(0);
    const next = session.nextProbe();
    if (next.status !== "probe") throw new Error("expected a probe");

    // Assignment (if this character had a match) is recorded by nextProbe
    // itself — BEFORE recordResponse is ever called, per the
    // adaptivity-instrumentation spec's "before the outcome is known".
    const assignmentsBeforeResponse = session.getAssignments().length;
    session.recordResponse({ character: next.probe.character, outcome: "incorrect", latencyMs: 4000, adultPresent: true });
    expect(session.getAssignments()).toHaveLength(assignmentsBeforeResponse);
  });
});

describe("AssessmentSession — full bout integration against the real candidate pool", () => {
  const MAX_ITEMS = 25; // multiple of the default dilution block size (5), for an exact ratio

  function runFullSession(deps: SessionDeps) {
    const config: AssessmentSessionConfig = {
      ...DEFAULT_ASSESSMENT_SESSION_CONFIG,
      maxItems: MAX_ITEMS,
      maxDurationMs: 10_000_000, // effectively unbounded — isolate the item-count bound
    };
    const session = new AssessmentSession({ sessionId: "integration-session", pool, config, deps });

    const probeKinds: string[] = [];
    const responses = [];

    for (;;) {
      const next = session.nextProbe();
      if (next.status !== "probe") break;
      probeKinds.push(next.probe.kind);

      // Scripted synthetic learner: easy items are guaranteed-success
      // (matching the real product guarantee); informative items are
      // always missed — the worst case for felt success rate, so the
      // measured overall accuracy is a conservative floor, not a
      // best-case number.
      const outcome = next.probe.kind === "easy" ? ("correct" as const) : ("incorrect" as const);
      const latencyMs = next.probe.kind === "easy" ? 500 : 4000;
      const result = session.recordResponse({
        character: next.probe.character,
        outcome,
        latencyMs,
        adultPresent: true,
      });
      responses.push(result);
    }

    return { session, probeKinds, responses };
  }

  it("scenario: session includes guaranteed-success items at approximately the configured ratio — dilution ratio holds exactly over a full bout", () => {
    const { probeKinds } = runFullSession(makeDeps());
    const easyCount = probeKinds.filter((k) => k === "easy").length;
    const informativeCount = probeKinds.filter((k) => k === "informative").length;
    expect(easyCount + informativeCount).toBe(MAX_ITEMS);
    expect(easyCount).toBe(20);
    expect(informativeCount).toBe(5);
  });

  it("felt success rate lands at or above the 80-85% target band's floor, even under the worst-case informative accuracy", () => {
    const { responses } = runFullSession(makeDeps());
    const correctCount = responses.filter((r) => r.event.outcome === "correct").length;
    const accuracy = correctCount / responses.length;
    // 20 guaranteed-correct easy items out of 25 total = exactly 0.8,
    // the target band's lower edge — a real learner does somewhat better
    // than 0% on informative items, pushing this up into the band.
    expect(accuracy).toBeCloseTo(0.8, 5);
  });

  it("every emitted event is schema-complete and passes learner-state's validateEvent (task 8.12)", () => {
    const { session } = runFullSession(makeDeps());
    for (const event of session.getEvents()) {
      const result = validateEvent(event);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it("informative probes span a wide difficulty range — coarse exploration, since no productive character is ever confirmed known in this script", () => {
    const difficultyIndex = computeDifficultyIndex(pool);
    const { session, probeKinds } = runFullSession(makeDeps());
    const informativeCharacters = session
      .getEvents()
      .filter((_, i) => probeKinds[i] === "informative")
      .map((e) => e.character);
    expect(informativeCharacters).toHaveLength(5);

    // 2 of the 5 informative slots are the forced identity/shaky
    // inclusion (every 3rd informative slot, 0-indexed: slots 0 and 3 —
    // see config.identityAndShakyEveryNInformativeSlots), which have no
    // difficulty value at all (no frequencyRank). The other 3 are
    // genuine frontier picks — those are what should show coarse spread.
    const frontierDifficulties = informativeCharacters
      .map((c) => difficultyIndex.get(c))
      .filter((d): d is number => d !== undefined);
    expect(frontierDifficulties).toHaveLength(3);
    const spread = Math.max(...frontierDifficulties) - Math.min(...frontierDifficulties);
    expect(spread).toBeGreaterThan(0.3); // touches a wide range, not a narrow cluster
  });

  it("the emitted log round-trips through export/parse to reproduce the identical mastery projection (mirrors learner-state's projection-replay discipline)", () => {
    const { session } = runFullSession(makeDeps());
    const events = session.getEvents();
    const direct = computeMasteryStates(events);
    const roundTripped = computeMasteryStates(parseJsonl(exportToJsonl(events)));
    expect(roundTripped).toEqual(direct);
  });

  it("the last-recorded response's mastery state matches an independent recompute over the full emitted log", () => {
    const { session, responses } = runFullSession(makeDeps());
    const last = responses[responses.length - 1]!;
    const independentStates = computeMasteryStates(session.getEvents());
    expect(independentStates.get(last.event.character)).toBe(last.masteryState);
  });

  it("is deterministic — identical config/deps-shape produce an identical probe sequence and event log", () => {
    const first = runFullSession(makeDeps());
    const second = runFullSession(makeDeps());
    expect(second.probeKinds).toEqual(first.probeKinds);
    expect(second.session.getEvents()).toEqual(first.session.getEvents());
    expect(second.session.getAssignments()).toEqual(first.session.getAssignments());
  });
});
