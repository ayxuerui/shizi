import { validateEvent, type LearnerEvent } from "@shizi/learner-state";
import { validateSessionRating, type ArmAssignment, type SessionRating } from "@shizi/adaptivity";
import { validateIssueReport, type IssueReport } from "@shizi/issue-reports";
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

/**
 * Loads every arm assignment this device has ever recorded (synced or
 * not), for seeding `ExposureSession.priorAssignments` on the next
 * launch — same "local history, not just the outbox" purpose as
 * `loadPriorEvents`. Needed so "existing assignment is honored" survives
 * a relaunch, not just a single in-memory session.
 */
export async function loadAllAssignments(): Promise<ArmAssignment[]> {
  const db = await getDB();
  const all = await db.getAll("assignments");
  return all.map((stored) => stored.assignment);
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
 * Validates before every write, same discipline as `enqueueEvent` — a
 * malformed rating reaching here would be a bug in this app's own
 * closing-beat wiring, not an expected external input.
 */
export async function enqueueRating(rating: SessionRating): Promise<void> {
  const result = validateSessionRating(rating);
  if (!result.valid) {
    console.error("event-queue: refusing to enqueue invalid rating", result.errors, rating);
    return;
  }
  const db = await getDB();
  await db.put("ratings", { rating, synced: false });
}

/** Follows the `events` (natural-key) pattern, not `assignments`'
 * surrogate-key pattern — `SessionRating.sessionId` is already unique. */
export async function listPendingRatings(): Promise<SessionRating[]> {
  const db = await getDB();
  const all = await db.getAll("ratings");
  const pending: SessionRating[] = [];
  for (const stored of all) {
    if (stored.synced) continue;
    const result = validateSessionRating(stored.rating);
    if (result.valid) {
      pending.push(stored.rating);
    } else {
      console.warn("event-queue: skipping invalid stored rating on read", result.errors);
    }
  }
  return pending;
}

export async function markRatingsSynced(sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("ratings", "readwrite");
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const existing = await tx.store.get(sessionId);
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

/**
 * add-issue-reporting (`issue-reporting` spec: "Reports are written
 * offline-first and synced idempotently"). Validates before every write,
 * same discipline as `enqueueEvent`/`enqueueRating` — a malformed report
 * reaching here would be a bug in the report form's own composition, not
 * an expected external input.
 */
export async function enqueueIssueReport(report: IssueReport): Promise<void> {
  const result = validateIssueReport(report);
  if (!result.valid) {
    console.error("event-queue: refusing to enqueue invalid issue report", result.errors, report);
    return;
  }
  const db = await getDB();
  await db.put("issueReports", { report, synced: false });
}

/** Follows the `ratings` (natural-key) pattern — `IssueReport.id` is the
 * idempotency key on both ends. Re-validated on read, like every other
 * store here. */
export async function listPendingIssueReports(): Promise<IssueReport[]> {
  const db = await getDB();
  const all = await db.getAll("issueReports");
  const pending: IssueReport[] = [];
  for (const stored of all) {
    if (stored.synced) continue;
    const result = validateIssueReport(stored.report);
    if (result.valid) {
      pending.push(stored.report);
    } else {
      console.warn("event-queue: skipping invalid stored issue report on read", result.errors);
    }
  }
  return pending;
}

export async function markIssueReportsSynced(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("issueReports", "readwrite");
  await Promise.all(
    ids.map(async (id) => {
      const existing = await tx.store.get(id);
      if (existing) await tx.store.put({ ...existing, synced: true });
    }),
  );
  await tx.done;
}
