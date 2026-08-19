import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openEventStore, type EventStore } from "./db.js";
import { pruneOldBackups, takeBackup } from "./backup.js";

describe("takeBackup (secondary layer of the SQLite backup plan — see design.md)", () => {
  let dir: string;
  let store: EventStore;
  let backupDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shizi-backup-test-"));
    store = openEventStore(join(dir, "events.sqlite"));
    store.insertEvent({
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
    });
    backupDir = join(dir, "backups");
    mkdirSync(backupDir, { recursive: true });
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a real, openable SQLite snapshot containing the current data", async () => {
    const destination = await takeBackup(store, backupDir);
    expect(existsSync(destination)).toBe(true);

    const restored = openEventStore(destination);
    expect(restored.getAllEvents()).toHaveLength(1);
    restored.close();
  });
});

describe("pruneOldBackups", () => {
  let backupDir: string;

  beforeEach(() => {
    backupDir = mkdtempSync(join(tmpdir(), "shizi-prune-test-"));
  });

  afterEach(() => {
    rmSync(backupDir, { recursive: true, force: true });
  });

  it("keeps only the most recent N snapshots, by filename order", () => {
    const names = ["events-2026-08-01.sqlite", "events-2026-08-02.sqlite", "events-2026-08-03.sqlite"];
    for (const name of names) writeFileSync(join(backupDir, name), "");

    pruneOldBackups(backupDir, 2);

    expect(existsSync(join(backupDir, "events-2026-08-01.sqlite"))).toBe(false);
    expect(existsSync(join(backupDir, "events-2026-08-02.sqlite"))).toBe(true);
    expect(existsSync(join(backupDir, "events-2026-08-03.sqlite"))).toBe(true);
  });

  it("does nothing when there are fewer snapshots than the keep count", () => {
    writeFileSync(join(backupDir, "events-2026-08-01.sqlite"), "");
    pruneOldBackups(backupDir, 5);
    expect(existsSync(join(backupDir, "events-2026-08-01.sqlite"))).toBe(true);
  });

  it("ignores files that don't match the backup naming pattern", () => {
    writeFileSync(join(backupDir, "not-a-backup.txt"), "");
    pruneOldBackups(backupDir, 0);
    expect(existsSync(join(backupDir, "not-a-backup.txt"))).toBe(true);
  });
});
