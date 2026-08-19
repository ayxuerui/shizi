import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment } from "@shizi/adaptivity";

export interface StoredEvent {
  event: LearnerEvent;
  synced: boolean;
}

export interface StoredAssignment {
  assignment: ArmAssignment;
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
}

const DB_NAME = "shizi-assessment";
const DB_VERSION = 1;

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
      upgrade(db) {
        if (!db.objectStoreNames.contains("events")) {
          db.createObjectStore("events", { keyPath: "event.id" });
        }
        if (!db.objectStoreNames.contains("assignments")) {
          db.createObjectStore("assignments", { autoIncrement: true });
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
