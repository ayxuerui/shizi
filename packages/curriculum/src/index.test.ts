import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("curriculum package scaffold", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@shizi/curriculum");
  });
});
