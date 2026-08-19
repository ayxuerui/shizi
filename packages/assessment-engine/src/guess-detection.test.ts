import { describe, expect, it } from "vitest";
import { classifyResponse } from "./guess-detection.js";

const config = { fastThresholdMs: 2000 };

describe("classifyResponse (assessment spec: 'Guess detection via confirmation and latency')", () => {
  it("scenario: single correct tap is inconclusive when slow — latency at or above threshold classifies as inconclusive, not confirming", () => {
    expect(classifyResponse("correct", 2000, config)).toBe("inconclusive");
    expect(classifyResponse("correct", 5000, config)).toBe("inconclusive");
  });

  it("scenario: fast confirming response — latency below threshold classifies as confirming", () => {
    expect(classifyResponse("correct", 1999, config)).toBe("confirming");
    expect(classifyResponse("correct", 0, config)).toBe("confirming");
  });

  it("scenario: slow correct response does not confirm — an incorrect response always classifies as a miss regardless of latency", () => {
    expect(classifyResponse("incorrect", 100, config)).toBe("miss");
    expect(classifyResponse("incorrect", 5000, config)).toBe("miss");
  });
});
