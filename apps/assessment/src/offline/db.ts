import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";
import type { IssueReport } from "@shizi/issue-reports";

export interface StoredEvent {
  event: LearnerEvent;
  synced: boolean;
}

export interface StoredAssignment {
  assignment: ArmAssignment;
  synced: boolean;
}

export interface StoredRating {
  rating: SessionRating;
  synced: boolean;
}

export interface StoredIssueReport {
  report: IssueReport;
  synced: boolean;
}

interface ShiziDBSchema extends DBSchema {
  events: {
    // LearnerEvent's own idempotency key — the same one learner-state's
    // EventLog uses, so re-enqueuing the same event id is a no-op here too.
    key: string;
    value: StoredEvent;
  };
  assignments: {
    // ArmAssignment has no single unique field (pairId identifies a PAIR,
    // not one assignment record) — auto-incrementing key is simplest and
    // correct, since assignments have no idempotency requirement the way
    // events do (see adaptivity's AssignmentLog, which is append-only by
    // construction, not by dedup).
    key: number;
    value: StoredAssignment;
  };
  ratings: {
    // SessionRating's own natural key — one rating per session by
    // construction (see its doc comment) — so this follows the `events`
    // (natural-key) pattern, not `assignments`' surrogate-key pattern.
    key: string;
    value: StoredRating;
  };
  issueReports: {
    // add-issue-reporting: IssueReport.id is client-generated
    // (crypto.randomUUID()) and is the server's idempotency key too, so
    // this follows the `events`/`ratings` natural-key pattern. The
    // adult-facing report form's outbox — and, like every other store
    // here, retained after sync rather than deleted (the deployment
    // spec's client-retention backstop).
    key: string;
    value: StoredIssueReport;
  };
}

const DB_NAME = "shizi-assessment";
// v4 (add-issue-reporting): adds the `issueReports` store. Purely additive
// — every existing store and row is kept. NOT downgradable: a device that
// has opened v4 cannot run a build asking for v3 (`VersionError`) without
// clearing site data, the same exposure the v2→v3 bump accepted; roll the
// gateway forward, not back, once any device has opened this version.
const DB_VERSION = 4;

/**
 * v2→v3 row translation (`rename-event-modality-to-activity` design
 * decision 4): rewrites pre-rename event rows — field `modality`, values
 * `expose-listen`/`expose-trace`/`hear-tap` — to the `module`/`activity`
 * schema, in place. Rows already in the new shape pass through untouched,
 * so re-running is a no-op. The hear-tap → `assess` mapping carries the
 * documented backfill imprecision (a legacy hear-tap row cannot prove
 * which module produced it; all recorded data predates the review module).
 */
function translateLegacyEventRow(stored: StoredEvent): StoredEvent {
  const event = stored.event as StoredEvent["event"] & { modality?: string };
  if (!("modality" in event) || typeof event.modality !== "string") return stored;
  const mapping: Record<string, { module: "learn" | "assess" | "review"; activity: "listen" | "trace" | "hear-tap" }> = {
    "expose-listen": { module: "learn", activity: "listen" },
    "expose-trace": { module: "learn", activity: "trace" },
    "hear-tap": { module: "assess", activity: "hear-tap" },
  };
  const mapped = mapping[event.modality] ?? { module: "assess", activity: "hear-tap" };
  const { modality: _retired, ...rest } = event;
  return { ...stored, event: { ...rest, ...mapped } };
}

/** Same translation for assignment rows' arm values (design decision 5). */
function translateLegacyAssignmentRow(stored: StoredAssignment): StoredAssignment {
  const arm = stored.assignment?.arm;
  if (arm === "expose-listen") return { ...stored, assignment: { ...stored.assignment, arm: "listen" } };
  if (arm === "expose-trace") return { ...stored, assignment: { ...stored.assignment, arm: "trace" } };
  return stored;
}

let dbPromise: Promise<IDBPDatabase<ShiziDBSchema>> | null = null;

/**
 * Task 8.2's local store: durable-enough local history (this device's
 * copy, seeding `AssessmentSession.priorEvents` on next launch) AND the
 * outbox for the eventual sync endpoint (Section 9) — one storage
 * mechanism serving both purposes, per design.md's "treat IndexedDB as
 * non-durable, the repo export is the durable copy" framing: this is a
 * cache/outbox, not the canonical record.
 */
export function getDB(): Promise<IDBPDatabase<ShiziDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ShiziDBSchema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "event.id" });
        }
        if (!db.objectStoreNames.contains("assignments")) {
          db.createObjectStore("assignments", { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("ratings")) {
          db.createObjectStore("ratings", { keyPath: "rating.sessionId" });
        }
        if (!db.objectStoreNames.contains("issueReports")) {
          db.createObjectStore("issueReports", { keyPath: "report.id" });
        }
        // v3 row normalization — purely additive (stores above are kept;
        // rows are rewritten in place), per the deployment spec's
        // client-retention backstop. Fresh databases have no rows yet, so
        // the cursor walks are no-ops for them — and so is the v3→v4
        // re-run on an already-translated database (no legacy `modality`
        // rows remain to rewrite).
        void oldVersion;
        let cursor = await transaction.objectStore("events").openCursor();
        while (cursor) {
          await cursor.update(translateLegacyEventRow(cursor.value));
          cursor = await cursor.continue();
        }
        let assignmentCursor = await transaction.objectStore("assignments").openCursor();
        while (assignmentCursor) {
          await assignmentCursor.update(translateLegacyAssignmentRow(assignmentCursor.value));
          assignmentCursor = await assignmentCursor.continue();
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only: closes the underlying connection (an open connection
 * otherwise blocks `indexedDB.deleteDatabase` from ever completing) and
 * drops the cached handle so each test can start from a fresh
 * (fake-indexeddb-backed) database. */
export async function __resetDBForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
}
