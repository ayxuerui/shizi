import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("character-data package scaffold", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@shizi/character-data");
  });
});
