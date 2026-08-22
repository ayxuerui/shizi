// harden-event-store: the actual "export -> commit -> push" backup
// loop, invoked by the daily cron entry (see infra/README.md). Must be
// run from the deploy clone — it reads/writes THAT clone's own git
// state and pushes from it.
//
// Refuses to run if the clone has any uncommitted changes outside
// data/events/ (specs/deployment/spec.md's "Backup automation commits
// only the canonical export") — an unattended process must never
// silently fold unrelated local state into a commit, especially since
// `main` has no branch protection.
//
// Every run appends a line to data/events/backup-log.txt, even when
// there's no new event/rating data — a quiet week and a stalled cron
// job must not look identical (spec's "distinguishable from silence").
// That file lives under data/events/ specifically so `git log --
// data/events/` (a path-scoped health check) picks up every run, not
// just ones that changed events.jsonl/ratings.jsonl.
//
// Usage: npx tsx scripts/backup-and-push.ts [--no-push]
//   (--no-push stops after committing — the real cron invocation always
//   pushes; tests and manual dry runs use this to skip it)

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pullEvents } from "./pull-events.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const DEFAULT_REPO_ROOT = join(packageRoot, "..", "..");

// Matches pull-events.ts's own DEFAULT_HOST_DB_PATH — the same fixed
// host location, since this script's whole point is to read it without
// a `docker volume inspect` step.
const DEFAULT_DB_PATH = "/home/ubuntu/.local/share/shizi/sync-data/events.sqlite";

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Thrown when the clone has uncommitted changes outside the canonical
 * export files. Named distinctly, same reasoning as pull-events.ts's
 * CanonicalRecordGuardError — lets a caller tell this apart from any
 * other failure without matching on message text.
 */
export class DirtyCloneError extends Error {
  constructor(public readonly dirtyPaths: string) {
    super(`Refusing to run — this clone has uncommitted changes outside data/events/:\n${dirtyPaths}`);
  }
}

/**
 * Pulled out so it's independently testable — mirrors pull-events.ts's
 * own "extract the decision logic, keep the entrypoint thin" split.
 * `git status --porcelain` with the three canonical files excluded via
 * pathspec magic (`:!path`) reports nothing at all when the clone is
 * otherwise clean.
 */
export function assertCleanOutsideExport(repoRoot: string): void {
  const status = git(
    [
      "status",
      "--porcelain",
      "--",
      ".",
      ":!data/events/events.jsonl",
      ":!data/events/ratings.jsonl",
      ":!data/events/backup-log.txt",
    ],
    repoRoot,
  ).trim();
  if (status.length > 0) throw new DirtyCloneError(status);
}

export interface RunBackupOptions {
  repoRoot: string;
  dbPath: string;
  /** Injectable so tests get deterministic output — Date.now()/`new
   * Date()` directly aren't used anywhere in this script for the same
   * reason. */
  now: () => string;
}

export interface RunBackupResult {
  eventsCount: number;
  ratingsCount: number;
  committedNewData: boolean;
}

/**
 * The full export -> log -> commit sequence, deliberately WITHOUT
 * pushing — split out so tests can exercise it against a real scratch
 * git repo with no real remote to push to. The CLI entrypoint below
 * calls `git push` itself, as the one step this function never takes.
 */
export function runBackup({ repoRoot, dbPath, now }: RunBackupOptions): RunBackupResult {
  assertCleanOutsideExport(repoRoot);

  const eventsDir = join(repoRoot, "data", "events");
  // shiziEnv: "prod" — this script only ever runs against production's
  // fixed host path; requestedOutDir is the canonical directory anyway,
  // so pull-events.ts's dev-store guard has nothing to refuse here.
  const result = pullEvents({ dbPath, requestedOutDir: eventsDir, shiziEnv: "prod" });

  const runAt = now();
  mkdirSync(eventsDir, { recursive: true });
  appendFileSync(
    join(eventsDir, "backup-log.txt"),
    `${runAt} ran: ${result.eventsCount} events, ${result.ratingsCount} ratings\n`,
  );

  git(
    ["add", "data/events/events.jsonl", "data/events/ratings.jsonl", "data/events/backup-log.txt"],
    repoRoot,
  );

  let dataChanged: boolean;
  try {
    git(["diff", "--cached", "--quiet", "--", "data/events/events.jsonl", "data/events/ratings.jsonl"], repoRoot);
    dataChanged = false;
  } catch {
    dataChanged = true;
  }

  if (dataChanged) {
    git(["commit", "-m", `data: sync event log (${runAt})`], repoRoot);
  } else {
    // Commits only the run-log touch — events.jsonl/ratings.jsonl were
    // staged above but produced no diff, so this commit's tree is
    // identical to the export files' prior committed state; only
    // backup-log.txt actually changes.
    git(["commit", "-m", `chore: backup ran, no new events (${runAt})`, "--", "data/events/backup-log.txt"], repoRoot);
  }

  return { eventsCount: result.eventsCount, ratingsCount: result.ratingsCount, committedNewData: dataChanged };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const noPush = process.argv.includes("--no-push");
  const dbPath = process.env.EVENTS_DB_PATH ?? DEFAULT_DB_PATH;

  try {
    const result = runBackup({ repoRoot: DEFAULT_REPO_ROOT, dbPath, now: () => new Date().toISOString() });
    console.log(
      `Backup ${result.committedNewData ? "committed new data" : "ran, nothing new"}: ` +
        `${result.eventsCount} events, ${result.ratingsCount} ratings.`,
    );
    if (!noPush) {
      git(["push"], DEFAULT_REPO_ROOT);
      console.log("Pushed.");
    }
  } catch (err) {
    if (err instanceof DirtyCloneError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
