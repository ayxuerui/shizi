import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";
import type { IssueReport } from "@shizi/issue-reports";
import DatabaseConstructor from "better-sqlite3";
import { existsSync } from "node:fs";
import { openEventStore, type EventStore } from "./db.js";

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

describe("openEventStore (task 9.2: append-with-idempotency-key logic)", () => {
  let dir: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-sync-service-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips an inserted event", () => {
    const event = makeEvent();
    const result = store.insertEvent(event);
    expect(result.inserted).toBe(true);
    expect(store.getAllEvents()).toEqual([event]);
  });

  it("is idempotent on re-insertion of the same event id", () => {
    const event = makeEvent();
    store.insertEvent(event);
    const second = store.insertEvent(event);
    expect(second.inserted).toBe(false);
    expect(store.getAllEvents()).toHaveLength(1);
  });

  it("preserves a null daysSinceLastExposure through the round trip", () => {
    store.insertEvent(makeEvent({ daysSinceLastExposure: null }));
    expect(store.getAllEvents()[0]!.daysSinceLastExposure).toBeNull();
  });

  it("preserves a non-null daysSinceLastExposure through the round trip", () => {
    store.insertEvent(makeEvent({ daysSinceLastExposure: 3.5 }));
    expect(store.getAllEvents()[0]!.daysSinceLastExposure).toBe(3.5);
  });

  it("preserves adultPresent as a real boolean, not 0/1, through the round trip", () => {
    store.insertEvent(makeEvent({ id: "evt-true", adultPresent: true }));
    store.insertEvent(makeEvent({ id: "evt-false", adultPresent: false }));
    const events = store.getAllEvents();
    expect(events.find((e) => e.id === "evt-true")!.adultPresent).toBe(true);
    expect(events.find((e) => e.id === "evt-false")!.adultPresent).toBe(false);
  });

  it("round-trips an inserted assignment", () => {
    const assignment: ArmAssignment = {
      character: "山",
      arm: "hear-tap",
      pairId: "山水",
      assignedAt: "2026-08-19T09:00:00.000Z",
    };
    store.insertAssignment(assignment);
    expect(store.getAllAssignments()).toEqual([assignment]);
  });

  it("is idempotent on re-insertion of the same character+pairId assignment", () => {
    const assignment: ArmAssignment = {
      character: "山",
      arm: "hear-tap",
      pairId: "山水",
      assignedAt: "2026-08-19T09:00:00.000Z",
    };
    store.insertAssignment(assignment);
    const second = store.insertAssignment(assignment);
    expect(second.inserted).toBe(false);
    expect(store.getAllAssignments()).toHaveLength(1);
  });

  it("orders events by timestamp", () => {
    store.insertEvent(makeEvent({ id: "evt-2", timestamp: "2026-08-19T10:00:00.000Z" }));
    store.insertEvent(makeEvent({ id: "evt-1", timestamp: "2026-08-19T09:00:00.000Z" }));
    expect(store.getAllEvents().map((e) => e.id)).toEqual(["evt-1", "evt-2"]);
  });

  it("round-trips an inserted rating", () => {
    const rating: SessionRating = {
      sessionId: "session-1",
      rating: "loved",
      recordedAt: "2026-08-19T09:00:00.000Z",
    };
    const result = store.insertRating(rating);
    expect(result.inserted).toBe(true);
    expect(store.getAllRatings()).toEqual([rating]);
  });

  it("is idempotent on re-insertion of the same sessionId rating (adaptivity-instrumentation spec: 'Parent one-tap session rating')", () => {
    const rating: SessionRating = {
      sessionId: "session-1",
      rating: "loved",
      recordedAt: "2026-08-19T09:00:00.000Z",
    };
    store.insertRating(rating);
    const second = store.insertRating(rating);
    expect(second.inserted).toBe(false);
    expect(store.getAllRatings()).toHaveLength(1);
  });
});

describe("migrateToActivitySchema (rename-event-modality-to-activity design decision 4)", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sync-db-migrate-"));
    dbPath = join(dir, "events.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function seedLegacyStore(): void {
    const raw = new DatabaseConstructor(dbPath);
    raw.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        character TEXT NOT NULL,
        modality TEXT NOT NULL,
        outcome TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        position_in_session INTEGER NOT NULL,
        prior_exposure_count INTEGER NOT NULL,
        days_since_last_exposure REAL,
        time_of_day INTEGER NOT NULL,
        adult_present INTEGER NOT NULL,
        received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE assignments (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        character TEXT NOT NULL,
        arm TEXT NOT NULL,
        pair_id TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (character, pair_id)
      );
    `);
    raw.prepare(
      `INSERT INTO events (id, timestamp, session_id, character, modality, outcome, latency_ms,
         position_in_session, prior_exposure_count, days_since_last_exposure, time_of_day, adult_present)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("legacy-1", "2026-08-20T09:00:00.000Z", "s1", "山", "expose-listen", "correct", 500, 0, 0, null, 9, 1);
    raw.prepare(
      `INSERT INTO events (id, timestamp, session_id, character, modality, outcome, latency_ms,
         position_in_session, prior_exposure_count, days_since_last_exposure, time_of_day, adult_present)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("legacy-2", "2026-08-20T09:01:00.000Z", "s1", "水", "hear-tap", "correct", 600, 1, 1, 0, 9, 1);
    raw.prepare(
      "INSERT INTO assignments (character, arm, pair_id, assigned_at) VALUES (?, ?, ?, ?)",
    ).run("山", "expose-trace", "p1", "2026-08-20T09:00:00.000Z");
    raw.close();
  }

  it("rebuilds a legacy store to module/activity rows, backfills arms, and writes a pre-migration snapshot", () => {
    seedLegacyStore();

    const store = openEventStore(dbPath);
    const events = store.getAllEvents();
    expect(events).toHaveLength(2);
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(byId.get("legacy-1")).toMatchObject({ module: "learn", activity: "listen" });
    // Documented backfill imprecision: legacy hear-tap rows map to assess.
    expect(byId.get("legacy-2")).toMatchObject({ module: "assess", activity: "hear-tap" });
    expect(store.getAllAssignments()[0]?.arm).toBe("trace");
    store.close();

    expect(existsSync(`${dbPath}.pre-activity-rename.bak`)).toBe(true);
  });

  it("is idempotent: reopening a migrated store neither re-migrates nor loses rows", () => {
    seedLegacyStore();
    openEventStore(dbPath).close();
    const store = openEventStore(dbPath);
    expect(store.getAllEvents()).toHaveLength(2);
    store.insertEvent(makeEvent({ id: "post-migration" }));
    store.close();

    const reopened = openEventStore(dbPath);
    expect(reopened.getAllEvents().map((e) => e.id)).toContain("post-migration");
    reopened.close();
  });
});

describe("issue_reports (add-issue-reporting, issue-reporting spec: 'Reports are written offline-first and synced idempotently' — server side)", () => {
  let dir: string;
  let dbPath: string;
  let store: EventStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-sync-service-reports-test-"));
    dbPath = join(dir, "events.sqlite");
    store = openEventStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips an inserted report byte-for-byte, including null context fields", () => {
    const report = makeIssueReport();
    const result = store.insertIssueReport(report);
    expect(result.inserted).toBe(true);
    expect(store.getAllIssueReports()).toEqual([report]);
  });

  it("round-trips non-null lastSessionId/lastActivity too", () => {
    const report = makeIssueReport({
      context: { ...makeIssueReport().context, lastSessionId: "session-9", lastActivity: "learn/trace" },
    });
    store.insertIssueReport(report);
    expect(store.getAllIssueReports()[0]!.context).toEqual(report.context);
  });

  it("is idempotent on re-insertion of the same report id", () => {
    const report = makeIssueReport();
    store.insertIssueReport(report);
    const second = store.insertIssueReport({ ...report, message: "a different message, same id" });
    expect(second.inserted).toBe(false);
    expect(store.getAllIssueReports()).toHaveLength(1);
    expect(store.getAllIssueReports()[0]!.message).toBe(report.message);
  });

  it("orders reports by createdAt, then id", () => {
    store.insertIssueReport(makeIssueReport({ id: "report-b", createdAt: "2026-08-29T11:00:00.000Z" }));
    store.insertIssueReport(makeIssueReport({ id: "report-c", createdAt: "2026-08-29T10:00:00.000Z" }));
    store.insertIssueReport(makeIssueReport({ id: "report-a", createdAt: "2026-08-29T10:00:00.000Z" }));
    expect(store.getAllIssueReports().map((r) => r.id)).toEqual(["report-a", "report-c", "report-b"]);
  });

  it("a store created before this change gains the table on reopen with every existing row untouched", () => {
    store.close();
    rmSync(dbPath, { force: true });

    // The exact pre-change schema (events/assignments/ratings, user_version
    // already stamped so the legacy migration is a no-op) — no issue_reports.
    const raw = new DatabaseConstructor(dbPath);
    raw.exec(`
      CREATE TABLE events (
        id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, session_id TEXT NOT NULL, character TEXT NOT NULL,
        module TEXT NOT NULL, activity TEXT NOT NULL, outcome TEXT NOT NULL, latency_ms INTEGER NOT NULL,
        position_in_session INTEGER NOT NULL, prior_exposure_count INTEGER NOT NULL,
        days_since_last_exposure REAL, time_of_day INTEGER NOT NULL, adult_present INTEGER NOT NULL,
        received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE assignments (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT, character TEXT NOT NULL, arm TEXT NOT NULL,
        pair_id TEXT NOT NULL, assigned_at TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (character, pair_id)
      );
      CREATE TABLE ratings (
        session_id TEXT PRIMARY KEY, rating TEXT NOT NULL, recorded_at TEXT NOT NULL,
        received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      PRAGMA user_version = 1;
    `);
    raw.prepare(
      `INSERT INTO events (id, timestamp, session_id, character, module, activity, outcome, latency_ms,
         position_in_session, prior_exposure_count, days_since_last_exposure, time_of_day, adult_present)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("pre-1", "2026-08-20T09:00:00.000Z", "s1", "山", "assess", "hear-tap", "correct", 500, 0, 0, null, 9, 1);
    raw.prepare("INSERT INTO ratings (session_id, rating, recorded_at) VALUES (?, ?, ?)").run(
      "s1",
      "loved",
      "2026-08-20T09:02:00.000Z",
    );
    raw.close();

    store = openEventStore(dbPath);
    expect(store.getAllIssueReports()).toEqual([]);
    expect(store.getAllEvents().map((e) => e.id)).toEqual(["pre-1"]);
    expect(store.getAllRatings()).toHaveLength(1);
    expect(store.insertIssueReport(makeIssueReport()).inserted).toBe(true);
    expect(store.getAllIssueReports()).toHaveLength(1);
  });
});
