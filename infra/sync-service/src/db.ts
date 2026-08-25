import { existsSync } from "node:fs";
import DatabaseConstructor, { type Database } from "better-sqlite3";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";

/**
 * Task 9.2's event store, self-hosted SQLite instead of Cloudflare D1 —
 * see design.md's "Cloudflare Pages/Worker/D1 → self-hosted" decision
 * entry for why. D1 itself is managed SQLite, so this schema and the
 * idempotency approach (INSERT OR IGNORE, keyed on the same `id` the
 * client's own `EventLog` already treats as the idempotency key) would
 * carry over unchanged if this ever did move to a real D1 instance.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  session_id TEXT NOT NULL,
  character TEXT NOT NULL,
  module TEXT NOT NULL,
  activity TEXT NOT NULL,
  outcome TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  position_in_session INTEGER NOT NULL,
  prior_exposure_count INTEGER NOT NULL,
  days_since_last_exposure REAL,
  time_of_day INTEGER NOT NULL,
  adult_present INTEGER NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS assignments (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  character TEXT NOT NULL,
  arm TEXT NOT NULL,
  pair_id TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (character, pair_id)
);

-- adaptivity-instrumentation spec's "Parent one-tap session rating":
-- session_id is the primary key, not an autoincrement row — a rating is
-- naturally one-per-session (see SessionRating's doc comment in
-- packages/adaptivity), so INSERT OR IGNORE on it is the same
-- idempotent-resync guarantee the events table already gets from its own
-- natural key.
CREATE TABLE IF NOT EXISTS ratings (
  session_id TEXT PRIMARY KEY,
  rating TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

interface EventRow {
  id: string;
  timestamp: string;
  session_id: string;
  character: string;
  module: string;
  activity: string;
  outcome: string;
  latency_ms: number;
  position_in_session: number;
  prior_exposure_count: number;
  days_since_last_exposure: number | null;
  time_of_day: number;
  adult_present: number;
}

interface AssignmentRow {
  row_id: number;
  character: string;
  arm: string;
  pair_id: string;
  assigned_at: string;
}

function rowToEvent(row: EventRow): LearnerEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    sessionId: row.session_id,
    character: row.character,
    module: row.module as LearnerEvent["module"],
    activity: row.activity as LearnerEvent["activity"],
    outcome: row.outcome as LearnerEvent["outcome"],
    latencyMs: row.latency_ms,
    positionInSession: row.position_in_session,
    priorExposureCount: row.prior_exposure_count,
    daysSinceLastExposure: row.days_since_last_exposure,
    timeOfDay: row.time_of_day,
    adultPresent: row.adult_present === 1,
  };
}

function rowToAssignment(row: AssignmentRow): ArmAssignment {
  return {
    character: row.character,
    arm: row.arm,
    pairId: row.pair_id,
    assignedAt: row.assigned_at,
  };
}

const SCHEMA_VERSION = 1;

interface RatingRow {
  session_id: string;
  rating: string;
  recorded_at: string;
}

function rowToRating(row: RatingRow): SessionRating {
  return {
    sessionId: row.session_id,
    rating: row.rating as SessionRating["rating"],
    recordedAt: row.recorded_at,
  };
}

export interface EventStore {
  insertEvent(event: LearnerEvent): { inserted: boolean };
  insertAssignment(assignment: ArmAssignment): { inserted: boolean };
  insertRating(rating: SessionRating): { inserted: boolean };
  getAllEvents(): LearnerEvent[];
  getAllAssignments(): ArmAssignment[];
  getAllRatings(): SessionRating[];
  backup(destinationPath: string): Promise<void>;
  close(): void;
}

/**
 * One-time migration to the module/activity event schema
 * (`rename-event-modality-to-activity` design decision 4): rebuilds the
 * events table translating legacy `modality` rows, translates assignment
 * arm values, and stamps `user_version` so it runs at most once per
 * store. Atomic (single transaction); a consistent pre-migration
 * snapshot is written beside the database first (`VACUUM INTO`, refused
 * if the snapshot already exists so a re-run cannot overwrite it).
 *
 * Backfill mapping — `expose-listen` → (learn, listen), `expose-trace` →
 * (learn, trace), `hear-tap` → (assess, hear-tap). The hear-tap → assess
 * mapping carries the documented imprecision: a legacy hear-tap row
 * cannot prove which module produced it, and every recorded event
 * predates the review module.
 */
function migrateToActivitySchema(db: Database, storePath: string): void {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version >= SCHEMA_VERSION) return;

  const columns = (
    db.pragma("table_info(events)") as ReadonlyArray<{ name: string }>
  ).map((column) => column.name);
  if (columns.includes("modality")) {
    const backupPath = `${storePath}.pre-activity-rename.bak`;
    if (!existsSync(backupPath)) {
      db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
    }
    db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS events_new;");
      db.exec(`
        CREATE TABLE events_new (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          session_id TEXT NOT NULL,
          character TEXT NOT NULL,
          module TEXT NOT NULL,
          activity TEXT NOT NULL,
          outcome TEXT NOT NULL,
          latency_ms INTEGER NOT NULL,
          position_in_session INTEGER NOT NULL,
          prior_exposure_count INTEGER NOT NULL,
          days_since_last_exposure REAL,
          time_of_day INTEGER NOT NULL,
          adult_present INTEGER NOT NULL,
          received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );
      `);
      db.exec(`
        INSERT INTO events_new
          (id, timestamp, session_id, character, module, activity, outcome,
           latency_ms, position_in_session, prior_exposure_count,
           days_since_last_exposure, time_of_day, adult_present, received_at)
        SELECT
          id, timestamp, session_id, character,
          CASE modality
            WHEN 'expose-listen' THEN 'learn'
            WHEN 'expose-trace' THEN 'learn'
            ELSE 'assess'
          END,
          CASE modality
            WHEN 'expose-listen' THEN 'listen'
            WHEN 'expose-trace' THEN 'trace'
            ELSE 'hear-tap'
          END,
          outcome, latency_ms, position_in_session, prior_exposure_count,
          days_since_last_exposure, time_of_day, adult_present, received_at
        FROM events;
      `);
      db.exec("DROP TABLE events;");
      db.exec("ALTER TABLE events_new RENAME TO events;");
      db.exec(
        "UPDATE assignments SET arm = 'listen' WHERE arm = 'expose-listen';" +
          "UPDATE assignments SET arm = 'trace' WHERE arm = 'expose-trace';",
      );
    })();
  }
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

export function openEventStore(path: string): EventStore {
  const db: Database = new DatabaseConstructor(path);
  db.pragma("journal_mode = WAL");
  migrateToActivitySchema(db, path);
  db.exec(SCHEMA);

  const insertEventStmt = db.prepare(`
    INSERT OR IGNORE INTO events
      (id, timestamp, session_id, character, module, activity, outcome, latency_ms,
       position_in_session, prior_exposure_count, days_since_last_exposure,
       time_of_day, adult_present)
    VALUES (@id, @timestamp, @sessionId, @character, @module, @activity, @outcome, @latencyMs,
            @positionInSession, @priorExposureCount, @daysSinceLastExposure,
            @timeOfDay, @adultPresent)
  `);

  const insertAssignmentStmt = db.prepare(`
    INSERT OR IGNORE INTO assignments (character, arm, pair_id, assigned_at)
    VALUES (@character, @arm, @pairId, @assignedAt)
  `);

  const insertRatingStmt = db.prepare(`
    INSERT OR IGNORE INTO ratings (session_id, rating, recorded_at)
    VALUES (@sessionId, @rating, @recordedAt)
  `);

  const selectEventsStmt = db.prepare(`SELECT * FROM events ORDER BY timestamp ASC, id ASC`);
  const selectAssignmentsStmt = db.prepare(`SELECT * FROM assignments ORDER BY row_id ASC`);
  const selectRatingsStmt = db.prepare(`SELECT * FROM ratings ORDER BY recorded_at ASC, session_id ASC`);

  return {
    insertEvent(event) {
      const result = insertEventStmt.run({
        id: event.id,
        timestamp: event.timestamp,
        sessionId: event.sessionId,
        character: event.character,
        module: event.module,
        activity: event.activity,
        outcome: event.outcome,
        latencyMs: event.latencyMs,
        positionInSession: event.positionInSession,
        priorExposureCount: event.priorExposureCount,
        daysSinceLastExposure: event.daysSinceLastExposure,
        timeOfDay: event.timeOfDay,
        adultPresent: event.adultPresent ? 1 : 0,
      });
      return { inserted: result.changes > 0 };
    },

    insertAssignment(assignment) {
      const result = insertAssignmentStmt.run({
        character: assignment.character,
        arm: assignment.arm,
        pairId: assignment.pairId,
        assignedAt: assignment.assignedAt,
      });
      return { inserted: result.changes > 0 };
    },

    getAllEvents() {
      return (selectEventsStmt.all() as EventRow[]).map(rowToEvent);
    },

    getAllAssignments() {
      return (selectAssignmentsStmt.all() as AssignmentRow[]).map(rowToAssignment);
    },

    insertRating(rating) {
      const result = insertRatingStmt.run({
        sessionId: rating.sessionId,
        rating: rating.rating,
        recordedAt: rating.recordedAt,
      });
      return { inserted: result.changes > 0 };
    },

    getAllRatings() {
      return (selectRatingsStmt.all() as RatingRow[]).map(rowToRating);
    },

    async backup(destinationPath) {
      await db.backup(destinationPath);
    },

    close() {
      db.close();
    },
  };
}
