import { beforeEach, describe, expect, it } from "vitest";
import { openDB, type IDBPDatabase } from "idb";
import { __resetDBForTests, getDB, type StoredEvent } from "./db.js";
import type { LearnerEvent } from "@shizi/learner-state";

const DB_NAME = "shizi-assessment";

function legacyEvent(overrides: Partial<LearnerEvent> & { modality: string }): unknown {
  // Pre-rename shape: `modality`, no `module`/`activity` — exactly what a
  // v2 database on a real device holds.
  const { module: _m, activity: _a, ...rest } = {
    id: "legacy-1",
    timestamp: "2026-08-20T09:00:00.000Z",
    sessionId: "session-legacy",
    character: "山",
    module: "assess" as const,
    activity: "hear-tap" as const,
    outcome: "correct" as const,
    latencyMs: 700,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
  };
  return { event: { ...rest, ...overrides }, synced: true };
}

/** Opens the database at v2 with legacy rows, the shape a real device
 * had before this upgrade — then closes it so getDB() performs the
 * v2→v3 upgrade itself. */
async function seedLegacyDatabase(): Promise<void> {
  const db: IDBPDatabase = await openDB(DB_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", { keyPath: "event.id" });
      }
      if (!db.objectStoreNames.contains("assignments")) {
        db.createObjectStore("assignments", { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("ratings")) {
        db.createObjectStore("ratings", { keyPath: "rating.sessionId" });
      }
    },
  });
  await db.put("events", legacyEvent({ id: "legacy-listen", modality: "expose-listen" }) as never);
  await db.put("events", legacyEvent({ id: "legacy-trace", modality: "expose-trace" }) as never);
  await db.put("events", legacyEvent({ id: "legacy-heartap", modality: "hear-tap" }) as never);
  await db.add(
    "assignments",
    { assignment: { character: "山", arm: "expose-listen", pairId: "p1", assignedAt: "2026-08-20T09:00:00.000Z" }, synced: true },
  );
  await db.close();
}

beforeEach(async () => {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
});

describe("offline db v3 upgrade (rename-event-modality-to-activity design decision 4)", () => {
  it("translates legacy v2 event rows to module/activity, preserving every row", async () => {
    await seedLegacyDatabase();

    const db = await getDB();
    const rows = (await db.getAll("events")) as StoredEvent[];
    expect(rows).toHaveLength(3);

    const byId = new Map(rows.map((r) => [r.event.id, r.event]));
    expect(byId.get("legacy-listen")).toMatchObject({ module: "learn", activity: "listen" });
    expect(byId.get("legacy-trace")).toMatchObject({ module: "learn", activity: "trace" });
    // Documented backfill imprecision: legacy hear-tap rows map to assess.
    expect(byId.get("legacy-heartap")).toMatchObject({ module: "assess", activity: "hear-tap" });
    for (const event of rows.map((r) => r.event)) {
      expect(event).not.toHaveProperty("modality");
    }
  });

  it("translates legacy assignment arm values to the new activity ids", async () => {
    await seedLegacyDatabase();

    const db = await getDB();
    const rows = await db.getAll("assignments");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.assignment.arm).toBe("listen");
  });

  it("a fresh v3 database round-trips new-shape events unchanged", async () => {
    const db = await getDB();
    const event: LearnerEvent = {
      id: "new-1",
      timestamp: "2026-08-24T10:00:00.000Z",
      sessionId: "session-new",
      character: "水",
      module: "review",
      activity: "hear-tap",
      outcome: "correct",
      latencyMs: 900,
      positionInSession: 0,
      priorExposureCount: 1,
      daysSinceLastExposure: 2,
      timeOfDay: 10,
      adultPresent: false,
    };
    await db.put("events", { event, synced: false });

    const rows = (await db.getAll("events")) as StoredEvent[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event).toEqual(event);
    expect(rows[0]!.synced).toBe(false);
  });
});
