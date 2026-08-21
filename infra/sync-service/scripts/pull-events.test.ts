import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { openEventStore, type EventStore } from "../src/db.js";
import { CanonicalRecordGuardError, pullEvents, resolveOutDir } from "./pull-events.js";

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
    outcome: "correct",
    latencyMs: 900,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

describe("resolveOutDir (add-dev-deployment, specs/deployment/spec.md: 'Canonical learner record is protected from non-production data')", () => {
  const canonicalOutDir = "/repo/data/events";

  it("refuses a dev store with no explicit --out-dir, naming the canonical path it declined", () => {
    expect(() => resolveOutDir({ requestedOutDir: undefined, shiziEnv: "dev", canonicalOutDir })).toThrow(
      CanonicalRecordGuardError,
    );
    try {
      resolveOutDir({ requestedOutDir: undefined, shiziEnv: "dev", canonicalOutDir });
    } catch (err) {
      expect((err as Error).message).toContain(canonicalOutDir);
    }
  });

  it("writes a dev store to an explicit --out-dir instead of refusing", () => {
    expect(resolveOutDir({ requestedOutDir: "/tmp/dev-export", shiziEnv: "dev", canonicalOutDir })).toBe(
      "/tmp/dev-export",
    );
  });

  it("resolves the canonical path unchanged for a prod store with no --out-dir — unchanged behavior", () => {
    expect(resolveOutDir({ requestedOutDir: undefined, shiziEnv: "prod", canonicalOutDir })).toBe(canonicalOutDir);
  });

  it("resolves the canonical path unchanged when SHIZI_ENV is unset (any ad hoc/local run)", () => {
    expect(resolveOutDir({ requestedOutDir: undefined, shiziEnv: undefined, canonicalOutDir })).toBe(
      canonicalOutDir,
    );
  });
});

describe("pullEvents (add-dev-deployment) — the guard end to end, against a real SQLite store", () => {
  let dir: string;
  let store: EventStore;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-pull-events-test-"));
    dbPath = join(dir, "events.sqlite");
    store = openEventStore(dbPath);
    store.insertEvent(makeEvent());
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("a dev store with no --out-dir throws and leaves the canonical data/events directory untouched, even when it doesn't exist yet", () => {
    // The repo's real canonical data/events/ may or may not exist on this
    // machine — what matters is that THIS call creates nothing at it. Point
    // at a canonical path inside the temp dir instead of the real repo path
    // so the assertion is self-contained and doesn't depend on (or risk)
    // the actual repo state.
    const canonicalOutDir = join(dir, "would-be-canonical", "data", "events");
    expect(existsSync(canonicalOutDir)).toBe(false);

    // pullEvents resolves its OWN canonical dir internally (repoRoot-based),
    // so exercise resolveOutDir directly here for the "nothing gets
    // created" half of the guarantee, and pullEvents below for the
    // "actually refuses end to end" half.
    expect(() => resolveOutDir({ requestedOutDir: undefined, shiziEnv: "dev", canonicalOutDir })).toThrow(
      CanonicalRecordGuardError,
    );
    expect(existsSync(canonicalOutDir)).toBe(false);

    expect(() => pullEvents({ dbPath, requestedOutDir: undefined, shiziEnv: "dev" })).toThrow(
      CanonicalRecordGuardError,
    );
  });

  it("a dev store with an explicit --out-dir writes there and succeeds", () => {
    const outDir = join(dir, "dev-export");
    const result = pullEvents({ dbPath, requestedOutDir: outDir, shiziEnv: "dev" });

    expect(result.outDir).toBe(outDir);
    expect(result.eventsCount).toBe(1);
    expect(existsSync(join(outDir, "events.jsonl"))).toBe(true);
    expect(readFileSync(join(outDir, "events.jsonl"), "utf8")).toContain("evt-1");
  });

  it("a prod store with no --out-dir writes the canonical repo-root data/events path, exactly as before this change", () => {
    const result = pullEvents({ dbPath, requestedOutDir: undefined, shiziEnv: "prod" });

    expect(result.outDir.endsWith(join("data", "events"))).toBe(true);
    expect(result.eventsCount).toBe(1);
    expect(existsSync(join(result.outDir, "events.jsonl"))).toBe(true);

    // Clean up — this test necessarily writes the REAL repo-root
    // data/events/ path (that's the behavior under test), so it must not
    // leave that behind for other tests/tools to trip over.
    rmSync(result.outDir, { recursive: true, force: true });
  });
});
