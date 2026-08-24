import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { openEventStore, type EventStore } from "../src/db.js";
import { CanonicalRecordGuardError, pullEvents, resolveOutDir } from "./pull-events.js";

// Mirrors pull-events.ts's own repoRoot derivation (scripts -> sync-service
// -> infra -> repo root). Duplicated deliberately rather than exported: the
// test that uses it asserts the two agree, so drift fails loudly instead of
// silently guarding the wrong directory.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Immediate file contents of a directory, or null if it doesn't exist. */
function snapshotDir(dir: string): Map<string, Buffer> | null {
  if (!existsSync(dir)) return null;
  const files = new Map<string, Buffer>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isFile()) files.set(name, readFileSync(path));
  }
  return files;
}

/** Puts a directory back exactly as `snapshotDir` found it: removes what the
 * test added, restores the byte content of what was already there, and
 * removes the directory entirely if it did not exist beforehand. */
function restoreDir(dir: string, snapshot: Map<string, Buffer> | null): void {
  if (snapshot === null) {
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!snapshot.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
    }
  }
  for (const [name, contents] of snapshot) {
    writeFileSync(join(dir, name), contents);
  }
}

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
    // This test necessarily writes the REAL repo-root data/events/ — that
    // resolution is the behavior under test. That directory is git-TRACKED
    // (events.jsonl, ratings.jsonl, backup-log.txt), so it is snapshotted and
    // restored rather than deleted.
    //
    // It previously ended with `rmSync(result.outDir, { recursive: true })`,
    // which removed those tracked files on every single test run. That is not
    // cosmetic: a working copy missing them reads as an unrelated local
    // change, which makes `backup-and-push` refuse to run (its
    // CleanCloneGuardError) — so the nightly backup of the canonical learner
    // record stops, and the only symptom is silence. See
    // specs/deployment/spec.md's "Backup automation commits only the
    // canonical export".
    const canonicalOutDir = join(repoRoot, "data", "events");
    const before = snapshotDir(canonicalOutDir);

    try {
      const result = pullEvents({ dbPath, requestedOutDir: undefined, shiziEnv: "prod" });

      // Pins the path derivation too: if the script's own repoRoot logic ever
      // changes, this fails loudly rather than the snapshot above silently
      // protecting a directory the script no longer writes to.
      expect(result.outDir).toBe(canonicalOutDir);
      expect(result.eventsCount).toBe(1);
      expect(existsSync(join(result.outDir, "events.jsonl"))).toBe(true);
    } finally {
      restoreDir(canonicalOutDir, before);
    }
  });

});

// The test above protects git-tracked files by snapshot/restore, so that
// mechanism is itself worth testing — if it silently did nothing, the tracked
// files would start disappearing again with no failing test to say so.
describe("snapshotDir/restoreDir — the mechanism protecting the real data/events/", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-snapshot-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("restores a pre-existing file's exact bytes after it is overwritten", () => {
    const target = join(dir, "tracked.jsonl");
    writeFileSync(target, "original\n");
    const before = snapshotDir(dir);

    writeFileSync(target, "clobbered by an export\n");
    restoreDir(dir, before);

    expect(readFileSync(target, "utf8")).toBe("original\n");
  });

  it("removes a file that did not exist beforehand", () => {
    writeFileSync(join(dir, "tracked.jsonl"), "original\n");
    const before = snapshotDir(dir);

    writeFileSync(join(dir, "added-by-export.jsonl"), "new\n");
    restoreDir(dir, before);

    expect(existsSync(join(dir, "added-by-export.jsonl"))).toBe(false);
    expect(existsSync(join(dir, "tracked.jsonl"))).toBe(true);
  });

  it("removes the directory entirely when it did not exist beforehand", () => {
    const absent = join(dir, "not-yet");
    const before = snapshotDir(absent);
    expect(before).toBeNull();

    // Simulates what pullEvents does on a machine with no data/events/ yet:
    // mkdirSync then write into it.
    mkdirSync(absent, { recursive: true });
    writeFileSync(join(absent, "events.jsonl"), "written by an export\n");

    restoreDir(absent, before);
    expect(existsSync(absent)).toBe(false);
  });
});
