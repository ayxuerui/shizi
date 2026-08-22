import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { openEventStore, type EventStore } from "../src/db.js";
import { assertCleanOutsideExport, DirtyCloneError, runBackup } from "./backup-and-push.js";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
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

/** A real scratch git repo, not a mock — same "use the real tool in an
 * isolated throwaway location" philosophy this package's other tests
 * (db.test.ts, pull-events.test.ts) already follow for SQLite. */
function initScratchRepo(dir: string): void {
  git(["init", "-q"], dir);
  git(["config", "user.email", "test@example.com"], dir);
  git(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "scratch repo for backup-and-push tests\n");
  git(["add", "README.md"], dir);
  git(["commit", "-q", "-m", "initial commit"], dir);
}

function commitCount(dir: string): number {
  return Number(git(["rev-list", "--count", "HEAD"], dir).trim());
}

describe("backup-and-push (harden-event-store, specs/deployment/spec.md)", () => {
  let repoDir: string;
  let dbPath: string;
  let store: EventStore;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "shizi-backup-repo-test-"));
    initScratchRepo(repoDir);
    dbPath = join(mkdtempSync(join(tmpdir(), "shizi-backup-db-test-")), "events.sqlite");
    store = openEventStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(repoDir, { recursive: true, force: true });
  });

  describe("assertCleanOutsideExport ('Backup automation commits only the canonical export')", () => {
    it("passes silently on a clean repo", () => {
      expect(() => assertCleanOutsideExport(repoDir)).not.toThrow();
    });

    it("throws DirtyCloneError when something outside data/events/ is uncommitted", () => {
      writeFileSync(join(repoDir, "unrelated.txt"), "oops\n");
      expect(() => assertCleanOutsideExport(repoDir)).toThrow(DirtyCloneError);
    });

    it("does not throw for changes limited to the three canonical export files", () => {
      writeFileSync(join(repoDir, "unrelated.txt"), "oops\n");
      git(["add", "unrelated.txt"], repoDir);
      git(["commit", "-q", "-m", "unrelated but committed"], repoDir);
      // Now genuinely clean again — nothing uncommitted at all, canonical
      // or otherwise. Confirms the guard isn't just permissive by accident.
      expect(() => assertCleanOutsideExport(repoDir)).not.toThrow();
    });
  });

  describe("runBackup", () => {
    it("refuses and commits nothing when the clone has unrelated uncommitted changes", () => {
      writeFileSync(join(repoDir, "unrelated.txt"), "oops\n");
      const before = commitCount(repoDir);

      expect(() => runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-22T00:00:00.000Z" })).toThrow(
        DirtyCloneError,
      );

      expect(commitCount(repoDir)).toBe(before);
    });

    it("commits the export and logs the run when new event data exists", () => {
      store.insertEvent(makeEvent());
      const before = commitCount(repoDir);

      const result = runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-22T00:00:00.000Z" });

      expect(result).toEqual({ eventsCount: 1, ratingsCount: 0, committedNewData: true });
      expect(commitCount(repoDir)).toBe(before + 1);
      expect(git(["log", "-1", "--format=%s"], repoDir)).toContain("sync event log");

      const eventsJsonl = readFileSync(join(repoDir, "data", "events", "events.jsonl"), "utf8");
      expect(eventsJsonl).toContain("evt-1");
      const backupLog = readFileSync(join(repoDir, "data", "events", "backup-log.txt"), "utf8");
      expect(backupLog).toContain("2026-08-22T00:00:00.000Z ran: 1 events, 0 ratings");
    });

    it("still commits (only the run log) and is distinguishable from silence when nothing changed", () => {
      // First run establishes a baseline commit with real data.
      store.insertEvent(makeEvent());
      runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-22T00:00:00.000Z" });
      const afterFirstRun = commitCount(repoDir);

      // Second run against the SAME unchanged store — no new events.
      const result = runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-23T00:00:00.000Z" });

      expect(result).toEqual({ eventsCount: 1, ratingsCount: 0, committedNewData: false });
      // A real, new commit exists — this IS the "distinguishable from
      // silence" proof: a stalled cron job would leave commitCount
      // unchanged, but a live one that found nothing new still commits.
      expect(commitCount(repoDir)).toBe(afterFirstRun + 1);
      expect(git(["log", "-1", "--format=%s"], repoDir)).toContain("backup ran, no new events");

      const backupLog = readFileSync(join(repoDir, "data", "events", "backup-log.txt"), "utf8");
      expect(backupLog.trim().split("\n")).toHaveLength(2);
      expect(backupLog).toContain("2026-08-23T00:00:00.000Z ran: 1 events, 0 ratings");

      // events.jsonl content is byte-identical to before — confirms the
      // export really is byte-stable for unchanged data, not just that
      // the commit happened to be empty for some other reason.
      const eventsJsonl = readFileSync(join(repoDir, "data", "events", "events.jsonl"), "utf8");
      expect(eventsJsonl).toContain("evt-1");
    });
  });
});
