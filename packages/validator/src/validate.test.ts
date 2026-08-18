import { describe, expect, it } from "vitest";
import { validate } from "./validate.js";
import type { ValidationContext } from "./types.js";

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    identitySet: new Set(["薛", "亦", "霖"]),
    knownSet: new Set(["山", "水", "人", "好"]),
    shakySet: new Set(),
    newTargets: new Set(),
    ...overrides,
  };
}

describe("validate — whitelist enforcement (spec: 'Whitelist enforcement')", () => {
  it("passes when every character is in identity, known, or new-target sets", () => {
    const result = validate("山水好", context());
    expect(result.valid).toBe(true);
    expect(result.findings.filter((f) => f.rule === "whitelist")).toEqual([]);
  });

  it("fails on a character outside all three sets, identifying it and its location", () => {
    const result = validate("山火水", context()); // 火 is not known
    expect(result.valid).toBe(false);
    const finding = result.findings.find((f) => f.rule === "whitelist");
    expect(finding).toMatchObject({ severity: "error", character: "火", location: 1 });
  });

  it("permits identity-set characters regardless of known-set", () => {
    const result = validate("薛亦霖", context({ knownSet: new Set() }));
    expect(result.valid).toBe(true);
  });

  it("permits declared new-target characters", () => {
    const result = validate("火火火火火火火火", context({ newTargets: new Set(["火"]) }));
    expect(result.findings.filter((f) => f.rule === "whitelist")).toEqual([]);
  });

  it("does not require punctuation or whitespace to be in any set", () => {
    const result = validate("山，水！ 好。", context());
    expect(result.valid).toBe(true);
  });
});

describe("validate — new-target repetition threshold (spec: 'New-target repetition threshold')", () => {
  it("passes when a new target meets the minimum repetition count", () => {
    const text = "火".repeat(8);
    const result = validate(text, context({ newTargets: new Set(["火"]) }));
    expect(result.findings.filter((f) => f.rule === "repetition-threshold")).toEqual([]);
  });

  it("fails when a new target is under-repeated, naming the character and its actual count", () => {
    const text = "火".repeat(3);
    const result = validate(text, context({ newTargets: new Set(["火"]) }));
    const finding = result.findings.find((f) => f.rule === "repetition-threshold");
    expect(finding).toMatchObject({ severity: "error", character: "火" });
    expect(finding!.message).toContain("3");
    expect(finding!.message).toContain("8");
  });

  it("respects a configured threshold override", () => {
    const text = "火".repeat(3);
    const result = validate(
      text,
      context({ newTargets: new Set(["火"]) }),
      { minRepetitionForNewTarget: 3, maxNewCharacterDensity: 1, targetShakyDensity: 0 },
    );
    expect(result.findings.filter((f) => f.rule === "repetition-threshold")).toEqual([]);
  });
});

describe("validate — new-character density limit (spec: 'New-character density limit')", () => {
  it("passes when new-target density is at or below the maximum", () => {
    // 1 new char in 20 = 5%, at the default limit exactly.
    const text = "火" + "山".repeat(19);
    const result = validate(text, context({ newTargets: new Set(["火"]) }));
    expect(result.findings.filter((f) => f.rule === "density")).toEqual([]);
  });

  it("fails when new-target density exceeds the maximum, stating actual and allowed proportions", () => {
    // 2 new chars in 10 = 20%, over the 5% default.
    const text = "火".repeat(2) + "山".repeat(8);
    const result = validate(text, context({ newTargets: new Set(["火"]) }));
    const finding = result.findings.find((f) => f.rule === "density");
    expect(finding?.severity).toBe("error");
    expect(finding!.message).toMatch(/20\.0%/);
    expect(finding!.message).toMatch(/5\.0%/);
  });
});

describe("validate — shaky-character seeding advisory (spec: 'Shaky-character seeding advisory')", () => {
  it("warns, without blocking, when no shaky characters are present", () => {
    const result = validate("山水好", context({ shakySet: new Set(["人"]) }));
    expect(result.valid).toBe(true); // warning only, never blocks
    const finding = result.findings.find((f) => f.rule === "shaky-seeding");
    expect(finding?.severity).toBe("warning");
  });

  it("does not warn when shaky density is near the target", () => {
    // 1 shaky char in 40 = target density exactly.
    const text = "人" + "山".repeat(39);
    const result = validate(text, context({ shakySet: new Set(["人"]), knownSet: new Set(["山", "人"]) }));
    expect(result.findings.filter((f) => f.rule === "shaky-seeding")).toEqual([]);
  });
});

describe("validate — confusable-adjacency advisory (spec: 'Confusable-adjacency advisory')", () => {
  it("warns when a confusable pair appears immediately adjacent, without blocking", () => {
    const confusabilityIndex = new Map([["日", new Set(["白"])], ["白", new Set(["日"])]]);
    const result = validate(
      "日白",
      context({ knownSet: new Set(["日", "白"]), confusabilityIndex }),
    );
    expect(result.valid).toBe(true);
    const finding = result.findings.find((f) => f.rule === "confusable-adjacency");
    expect(finding).toMatchObject({ severity: "warning", location: 0 });
  });

  it("does not warn when a confusability index is not supplied", () => {
    const result = validate("日白", context({ knownSet: new Set(["日", "白"]) }));
    expect(result.findings.filter((f) => f.rule === "confusable-adjacency")).toEqual([]);
  });
});

describe("validate — structured result (spec: 'Structured validation result')", () => {
  it("marks text invalid overall while still listing a warning separately, when both occur", () => {
    const result = validate("火", context({ newTargets: new Set(["火"]), shakySet: new Set(["人"]) }));
    expect(result.valid).toBe(false); // repetition-threshold error
    expect(result.findings.some((f) => f.severity === "error")).toBe(true);
    expect(result.findings.some((f) => f.severity === "warning")).toBe(true);
  });

  it("marks clean text valid with an empty findings list", () => {
    // 1 shaky char in 40 = exactly the target density — no warning either.
    const text = "人" + "好".repeat(39);
    const result = validate(
      text,
      context({ knownSet: new Set(["人", "好"]), shakySet: new Set(["人"]) }),
    );
    expect(result).toEqual({ valid: true, findings: [] });
  });
});
