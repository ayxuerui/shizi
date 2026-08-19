import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { EventStore } from "./db.js";

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const KEEP_LAST_N = 14; // ~3.5 days of 6-hourly snapshots

/**
 * The "secondary" layer of the backup plan (design.md): cheap insurance
 * against the live SQLite file getting corrupted between runs of
 * `scripts/pull-events.ts` (the PRIMARY, actually-durable backup — a
 * git-committed JSONL export). This does not protect against a disk
 * failure on its own; it protects against "the live file broke an hour
 * after the last JSONL pull."
 */
export function startBackupSchedule(
  store: EventStore,
  backupDir: string,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): NodeJS.Timeout {
  mkdirSync(backupDir, { recursive: true });
  const run = (): void => {
    void takeBackup(store, backupDir).catch((error: unknown) => {
      console.error("backup: snapshot failed", error);
    });
  };
  run(); // one immediately at boot rather than waiting a full interval for the first snapshot
  return setInterval(run, intervalMs);
}

export async function takeBackup(store: EventStore, backupDir: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destination = join(backupDir, `events-${timestamp}.sqlite`);
  await store.backup(destination);
  pruneOldBackups(backupDir);
  return destination;
}

export function pruneOldBackups(backupDir: string, keep: number = KEEP_LAST_N): void {
  const files = readdirSync(backupDir)
    .filter((name) => name.startsWith("events-") && name.endsWith(".sqlite"))
    .sort(); // ISO-derived timestamps in the filename sort chronologically
  const toRemove = files.slice(0, Math.max(0, files.length - keep));
  for (const name of toRemove) {
    unlinkSync(join(backupDir, name));
  }
}
