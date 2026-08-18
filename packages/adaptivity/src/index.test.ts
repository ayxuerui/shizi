import { describe, expect, it } from "vitest";
import { PACKAGE_NAME } from "./index.js";

describe("adaptivity package", () => {
  it("exposes its package name", () => {
    expect(PACKAGE_NAME).toBe("@shizi/adaptivity");
  });
});
