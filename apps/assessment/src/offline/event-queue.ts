import { validateEvent, type LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment } from "@shizi/adaptivity";
import { getDB } from "./db.js";

/**
 * Validates before every write (mirroring learner-state's own EventLog
 * discipline) — a malformed event reaching here would be a bug in this
 * app's own session-composition layer, not an expected external input,
 * so it's refused loudly rather than silently corrupting local storage.
 */
export async function enqueueEvent(event: LearnerEvent): Promise<void> {
  const result = validateEvent(event);
  if (!result.valid) {
    console.error("event-queue: refusing to enqueue invalid event", result.errors, event);
    return;
  }
  const db = await getDB();
  await db.put("events", { event, synced: false });
}

export async function enqueueAssignments(assignments: readonly ArmAssignment[]): Promise<void> {
  if (assignments.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("assignments", "readwrite");
  await Promise.all([
    ...assignments.map((assignment) => tx.store.add({ assignment, synced: false })),
    tx.done,
  ]);
}

export async function listPendingEvents(): Promise<LearnerEvent[]> {
  const db = await getDB();
  const all = await db.getAll("events");
  return all.filter((stored) => !stored.synced).map((stored) => stored.event);
}

export interface PendingAssignment {
  /** The assignments store's autoIncrement key — needed to mark exactly
   * these rows synced afterward, since ArmAssignment itself has no
   * natural unique field (see db.ts's doc comment). */
  key: number;
  assignment: ArmAssignment;
}

export async function listPendingAssignments(): Promise<PendingAssignment[]> {
  const db = await getDB();
  const [allValues, allKeys] = await Promise.all([
    db.getAll("assignments"),
    db.getAllKeys("assignments"),
  ]);
  const pending: PendingAssignment[] = [];
  for (let i = 0; i < allValues.length; i++) {
    if (!allValues[i]!.synced) {
      pending.push({ key: allKeys[i]!, assignment: allValues[i]!.assignment });
    }
  }
  return pending;
}

export async function markAssignmentsSynced(keys: readonly number[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("assignments", "readwrite");
  await Promise.all([
    ...keys.map(async (key) => {
      const existing = await tx.store.get(key);
      if (existing) await tx.store.put({ ...existing, synced: true }, key);
    }),
    tx.done,
  ]);
}

export async function markEventsSynced(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("events", "readwrite");
  await Promise.all(
    ids.map(async (id) => {
      const existing = await tx.store.get(id);
      if (existing) await tx.store.put({ ...existing, synced: true });
    }),
  );
  await tx.done;
}

/**
 * Loads every event this device has ever recorded, for seeding
 * `AssessmentSession.priorEvents` on the next launch (`priorExposureCount`/
 * `daysSinceLastExposure` continuity, and the frontier bracket starting
 * pre-narrowed for a returning learner — see `assessment-engine`'s
 * frontier.ts). Re-validated on read, not just write: a future schema
 * change shouldn't let an old, now-invalid record silently corrupt a
 * fresh session.
 */
export async function loadPriorEvents(): Promise<LearnerEvent[]> {
  const db = await getDB();
  const all = await db.getAll("events");
  const events: LearnerEvent[] = [];
  for (const stored of all) {
    const result = validateEvent(stored.event);
    if (result.valid) {
      events.push(stored.event);
    } else {
      console.warn("event-queue: skipping invalid stored event on read", result.errors);
    }
  }
  return events;
}
