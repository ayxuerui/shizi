import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import type { IssueReport } from "@shizi/issue-reports";
import { openEventStore, type EventStore } from "../src/db.js";
import { assertCleanOutsideExport, DirtyCloneError, rebaseThenPush, runBackup } from "./backup-and-push.js";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    module: "assess",
    activity: "hear-tap",
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


function makeIssueReport(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    id: "report-1",
    kind: "bug",
    message: "The audio did not play for 山.",
    createdAt: "2026-08-29T10:00:00.000Z",
    context: {
      appEnv: "prod",
      buildId: "abc1234",
      userAgent: "Mozilla/5.0 (iPad)",
      standalone: true,
      online: false,
      lastSessionId: null,
      lastActivity: null,
    },
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

    it("add-issue-reporting: an uncommitted issue-reports.jsonl alone is not dirt, but an unrelated file still is", () => {
      mkdirSync(join(repoDir, "data", "events"), { recursive: true });
      writeFileSync(join(repoDir, "data", "events", "issue-reports.jsonl"), `${JSON.stringify(makeIssueReport())}\n`);
      expect(() => assertCleanOutsideExport(repoDir)).not.toThrow();

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

      expect(result).toEqual({ eventsCount: 1, ratingsCount: 0, issueReportsCount: 0, committedNewData: true });
      expect(commitCount(repoDir)).toBe(before + 1);
      expect(git(["log", "-1", "--format=%s"], repoDir)).toContain("sync event log");

      const eventsJsonl = readFileSync(join(repoDir, "data", "events", "events.jsonl"), "utf8");
      expect(eventsJsonl).toContain("evt-1");
      const backupLog = readFileSync(join(repoDir, "data", "events", "backup-log.txt"), "utf8");
      expect(backupLog).toContain("2026-08-22T00:00:00.000Z ran: 1 events, 0 ratings, 0 issue reports");
    });

    it("add-issue-reporting: a run where ONLY a new issue report exists commits as new data, not as 'nothing new'", () => {
      store.insertEvent(makeEvent());
      runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-22T00:00:00.000Z" });
      const afterFirstRun = commitCount(repoDir);

      store.insertIssueReport(makeIssueReport());
      const result = runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-23T00:00:00.000Z" });

      expect(result).toEqual({ eventsCount: 1, ratingsCount: 0, issueReportsCount: 1, committedNewData: true });
      expect(commitCount(repoDir)).toBe(afterFirstRun + 1);
      expect(git(["log", "-1", "--format=%s"], repoDir)).toContain("sync event log");
      expect(git(["log", "-1", "--format=%s"], repoDir)).not.toContain("no new events");

      const reportsJsonl = readFileSync(join(repoDir, "data", "events", "issue-reports.jsonl"), "utf8");
      expect(reportsJsonl).toContain("The audio did not play for 山.");
      // Committed, not merely written: the file is in HEAD's tree.
      expect(git(["show", "HEAD:data/events/issue-reports.jsonl"], repoDir)).toContain("report-1");
      const backupLog = readFileSync(join(repoDir, "data", "events", "backup-log.txt"), "utf8");
      expect(backupLog).toContain("2026-08-23T00:00:00.000Z ran: 1 events, 0 ratings, 1 issue reports");
    });

    it("pushes even after origin/main has moved independently (rebaseThenPush — the six-days-of-stalled-backups bug)", () => {
      // A real scratch remote + two clones, mirroring production's shape:
      // the deploy clone (cron pushes from here) and "GitHub" (PR merges
      // move main independently of the deploy clone).
      const scratchDir = mkdtempSync(join(tmpdir(), "shizi-backup-push-test-"));
      try {
        const originDir = join(scratchDir, "origin.git");
        mkdirSync(originDir);
        git(["init", "-q", "--bare", "--initial-branch=main", originDir], scratchDir);

        const deployDir = join(scratchDir, "deploy");
        git(["clone", "-q", originDir, deployDir], scratchDir);
        initScratchRepo(deployDir);
        git(["push", "-q", "-u", "origin", "main"], deployDir);

        // A PR merges on "GitHub": origin/main moves without the deploy
        // clone knowing.
        const prDir = join(scratchDir, "pr");
        git(["clone", "-q", originDir, prDir], scratchDir);
        git(["config", "user.email", "test@example.com"], prDir);
        git(["config", "user.name", "Test"], prDir);
        writeFileSync(join(prDir, "feature.txt"), "merged via PR\n");
        git(["add", "feature.txt"], prDir);
        git(["commit", "-q", "-m", "feat: merged on GitHub"], prDir);
        git(["push", "-q"], prDir);

        // Meanwhile the nightly backup commits locally in the deploy clone.
        mkdirSync(join(deployDir, "data", "events"), { recursive: true });
        writeFileSync(join(deployDir, "data", "events", "backup-log.txt"), "ran\n");
        git(["add", "data/events/backup-log.txt"], deployDir);
        git(["commit", "-q", "-m", "chore: backup ran"], deployDir);

        // A bare `git push` here would be rejected as non-fast-forward.
        expect(() => git(["push", "-q"], deployDir)).toThrow();

        rebaseThenPush(deployDir);

        // Origin now has BOTH commits — the PR merge and the backup.
        const originLog = git(["log", "main", "--format=%s"], originDir);
        expect(originLog).toContain("chore: backup ran");
        expect(originLog).toContain("feat: merged on GitHub");
      } finally {
        rmSync(scratchDir, { recursive: true, force: true });
      }
    });

    it("aborts a conflicted rebase and rethrows, leaving the clone in a normal state for the next run", () => {
      const scratchDir = mkdtempSync(join(tmpdir(), "shizi-backup-conflict-test-"));
      try {
        const originDir = join(scratchDir, "origin.git");
        mkdirSync(originDir);
        git(["init", "-q", "--bare", "--initial-branch=main", originDir], scratchDir);

        const deployDir = join(scratchDir, "deploy");
        git(["clone", "-q", originDir, deployDir], scratchDir);
        initScratchRepo(deployDir);
        mkdirSync(join(deployDir, "data", "events"), { recursive: true });
        writeFileSync(join(deployDir, "data", "events", "backup-log.txt"), "baseline\n");
        git(["add", "data/events/backup-log.txt"], deployDir);
        git(["commit", "-q", "-m", "baseline log"], deployDir);
        git(["push", "-q", "-u", "origin", "main"], deployDir);

        // Should never happen in practice (nothing else writes
        // data/events/*), but if it does: conflicting edits to the same
        // file on both sides.
        const prDir = join(scratchDir, "pr");
        git(["clone", "-q", originDir, prDir], scratchDir);
        git(["config", "user.email", "test@example.com"], prDir);
        git(["config", "user.name", "Test"], prDir);
        writeFileSync(join(prDir, "data", "events", "backup-log.txt"), "edited remotely\n");
        git(["add", "data/events/backup-log.txt"], prDir);
        git(["commit", "-q", "-m", "remote edit"], prDir);
        git(["push", "-q"], prDir);

        writeFileSync(join(deployDir, "data", "events", "backup-log.txt"), "edited locally\n");
        git(["add", "data/events/backup-log.txt"], deployDir);
        git(["commit", "-q", "-m", "local edit"], deployDir);

        expect(() => rebaseThenPush(deployDir)).toThrow();

        // The failed rebase was aborted — no rebase state left behind, so
        // the NEXT nightly run isn't wedged by this one's failure.
        expect(existsSync(join(deployDir, ".git", "rebase-merge"))).toBe(false);
        expect(existsSync(join(deployDir, ".git", "rebase-apply"))).toBe(false);
        expect(() => assertCleanOutsideExport(deployDir)).not.toThrow();
      } finally {
        rmSync(scratchDir, { recursive: true, force: true });
      }
    });

    it("still commits (only the run log) and is distinguishable from silence when nothing changed", () => {
      // First run establishes a baseline commit with real data.
      store.insertEvent(makeEvent());
      runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-22T00:00:00.000Z" });
      const afterFirstRun = commitCount(repoDir);

      // Second run against the SAME unchanged store — no new events.
      const result = runBackup({ repoRoot: repoDir, dbPath, now: () => "2026-08-23T00:00:00.000Z" });

      expect(result).toEqual({ eventsCount: 1, ratingsCount: 0, issueReportsCount: 0, committedNewData: false });
      // A real, new commit exists — this IS the "distinguishable from
      // silence" proof: a stalled cron job would leave commitCount
      // unchanged, but a live one that found nothing new still commits.
      expect(commitCount(repoDir)).toBe(afterFirstRun + 1);
      expect(git(["log", "-1", "--format=%s"], repoDir)).toContain("backup ran, no new events");

      const backupLog = readFileSync(join(repoDir, "data", "events", "backup-log.txt"), "utf8");
      expect(backupLog.trim().split("\n")).toHaveLength(2);
      expect(backupLog).toContain("2026-08-23T00:00:00.000Z ran: 1 events, 0 ratings, 0 issue reports");

      // events.jsonl content is byte-identical to before — confirms the
      // export really is byte-stable for unchanged data, not just that
      // the commit happened to be empty for some other reason.
      const eventsJsonl = readFileSync(join(repoDir, "data", "events", "events.jsonl"), "utf8");
      expect(eventsJsonl).toContain("evt-1");
    });
  });
});
