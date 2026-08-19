import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSESSMENT_SESSION_CONFIG } from "@shizi/assessment-engine";
import { loadPublishedConfig } from "./published-config.js";

function makeCharacterAttributes(character: string) {
  return {
    character,
    frequencyRank: 1,
    concreteness: "concrete" as const,
    pictographic: false,
    tagSource: "reviewed" as const,
    strokeCount: 3,
    strokeData: { strokes: ["M0 0"], medians: [[[0, 0] as [number, number]]] },
    personalRelevance: 0,
  };
}

function fetchReturning(body: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? status : 500 })) as unknown as typeof fetch;
}

describe("loadPublishedConfig (task 9.4's client half)", () => {
  it("prefers config.json's probe pool and difficulty params when it loads successfully", async () => {
    const published = {
      knownSet: ["山"],
      nextTargets: ["水"],
      probePool: { 山: makeCharacterAttributes("山") },
      difficultyParams: {
        guessDetection: { fastThresholdMs: 1234 },
        dilution: { easyPerInformative: 2 },
        calibration: DEFAULT_ASSESSMENT_SESSION_CONFIG.calibration,
        optionCount: 3,
      },
    };
    const fetchImpl = fetchReturning(published);

    const result = await loadPublishedConfig(fetchImpl);

    expect(result.source).toBe("published");
    expect(result.pool.has("山")).toBe(true);
    expect(result.config.guessDetection.fastThresholdMs).toBe(1234);
    expect(result.config.dilution.easyPerInformative).toBe(2);
    expect(result.config.optionCount).toBe(3);
  });

  it("does NOT surface knownSet/nextTargets — those are Loop 1's concern, not this app's", async () => {
    const published = {
      knownSet: ["山"],
      nextTargets: ["水"],
      probePool: { 山: makeCharacterAttributes("山") },
      difficultyParams: {
        guessDetection: DEFAULT_ASSESSMENT_SESSION_CONFIG.guessDetection,
        dilution: DEFAULT_ASSESSMENT_SESSION_CONFIG.dilution,
        calibration: DEFAULT_ASSESSMENT_SESSION_CONFIG.calibration,
        optionCount: DEFAULT_ASSESSMENT_SESSION_CONFIG.optionCount,
      },
    };
    const result = await loadPublishedConfig(fetchReturning(published));
    expect(result).not.toHaveProperty("knownSet");
    expect(result).not.toHaveProperty("nextTargets");
  });

  it("falls back to the bundled pool/config on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    const result = await loadPublishedConfig(fetchImpl);
    expect(result.source).toBe("bundled-fallback");
    expect(result.config).toEqual(DEFAULT_ASSESSMENT_SESSION_CONFIG);
  });

  it("falls back to the bundled pool/config when fetch itself throws (offline, first run)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;
    const result = await loadPublishedConfig(fetchImpl);
    expect(result.source).toBe("bundled-fallback");
  });

  it("falls back to the bundled pool/config when the response is malformed JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json {{{", { status: 200 })) as unknown as typeof fetch;
    const result = await loadPublishedConfig(fetchImpl);
    expect(result.source).toBe("bundled-fallback");
  });

  it("falls back to the bundled pool/config when the response has an unexpected shape", async () => {
    const fetchImpl = fetchReturning({ unexpected: "shape" });
    const result = await loadPublishedConfig(fetchImpl);
    expect(result.source).toBe("bundled-fallback");
  });

  it("the bundled fallback still has a genuinely usable (non-empty) pool", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await loadPublishedConfig(fetchImpl);
    expect(result.pool.size).toBeGreaterThan(0);
  });
});
