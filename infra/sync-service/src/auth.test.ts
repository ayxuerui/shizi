import { describe, expect, it } from "vitest";
import { checkAuth } from "./auth.js";

describe("checkAuth (task 9.3: shared-token auth)", () => {
  it("accepts a matching Bearer token", () => {
    expect(checkAuth("Bearer secret-token", "secret-token")).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(checkAuth("Bearer wrong-token", "secret-token")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(checkAuth(undefined, "secret-token")).toBe(false);
    expect(checkAuth(null, "secret-token")).toBe(false);
  });

  it("rejects a header without the Bearer prefix", () => {
    expect(checkAuth("secret-token", "secret-token")).toBe(false);
    expect(checkAuth("Basic secret-token", "secret-token")).toBe(false);
  });

  it("rejects a token of a different length without throwing", () => {
    expect(checkAuth("Bearer short", "a-much-longer-secret-token")).toBe(false);
  });

  it("rejects an empty provided token", () => {
    expect(checkAuth("Bearer ", "secret-token")).toBe(false);
  });
});
