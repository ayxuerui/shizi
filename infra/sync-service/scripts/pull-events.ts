// Task 9.5: reads the live SQLite event store DIRECTLY (same machine/
// volume as the sync service — no HTTP round-trip needed, simpler than
// standing up a second authenticated export endpoint) and regenerates
// data/events/events.jsonl — the actual durable, versioned backup (see
// design.md's "repo-side JSONL export is the canonical record"
// principle, which applies to this self-hosted SQLite store exactly as
// it would to Cloudflare D1).
//
// Run manually (`npm run pull:events` from this package) or on whatever
// cadence you choose (cron, a CI job, etc.) — the cadence itself is a
// config knob, not something this script needs to decide.
//
// add-dev-deployment: refuses to write the canonical data/events/
// location when SHIZI_ENV=dev (see docker-compose.dev.yml's `sync-dev`)
// unless an explicit --out-dir is given — dev event data is disposable
// by design (specs/deployment/spec.md's "Canonical learner record is
// protected from non-production data") and must never land in the
// project's actual durable learner record. SHIZI_ENV=prod (or unset, for
// any ad hoc/local run against a store that isn't dev's) behaves exactly
// as before this change.
//
// Usage: npx tsx scripts/pull-events.ts [path-to-db] [--out-dir <dir>]
//   (db path defaults to $EVENTS_DB_PATH, then ./data/events.sqlite)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportToJsonl, toJsonl } from "@shizi/learner-state";
import { openEventStore } from "../src/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");

/**
 * Thrown when SHIZI_ENV=dev and no explicit --out-dir was given. Named
 * distinctly (not a generic Error) so a caller — the CLI wrapper below,
 * or a future one — can tell "the guard fired" apart from any other
 * failure without matching on message text.
 */
export class CanonicalRecordGuardError extends Error {}

export interface ResolveOutDirOptions {
  requestedOutDir: string | undefined;
  shiziEnv: string | undefined;
  canonicalOutDir: string;
}

/**
 * The guard's decision logic, pulled out as a pure function so it's
 * unit-testable without touching a real SQLite file — same "extract the
 * logic, keep the entrypoint thin" split this package already uses for
 * `handle-sync.ts` vs `server.ts`. Throws rather than returning the
 * canonical path when it would be wrong to write there; callers must not
 * write anything on the thrown path (see `pullEvents` below — the throw
 * happens before any directory is created or file touched, so the
 * canonical location is left exactly as it was, including not existing).
 */
export function resolveOutDir({ requestedOutDir, shiziEnv, canonicalOutDir }: ResolveOutDirOptions): string {
  if (requestedOutDir) return requestedOutDir;
  if (shiziEnv === "dev") {
    throw new CanonicalRecordGuardError(
      `Refusing to write the canonical learner record at ${canonicalOutDir} from a dev event ` +
        `store (SHIZI_ENV=dev). Dev event data is disposable by design — pass --out-dir <path> ` +
        `to export it somewhere else instead.`,
    );
  }
  return canonicalOutDir;
}

export interface PullEventsOptions {
  dbPath: string;
  requestedOutDir: string | undefined;
  shiziEnv: string | undefined;
}

export interface PullEventsResult {
  outDir: string;
  eventsCount: number;
  ratingsCount: number;
}

/**
 * The script's actual work, decomposed into a plain function so tests
 * can call it directly instead of spawning a subprocess and parsing
 * stdout. Reads the given SQLite store and writes both JSONL files into
 * whichever directory `resolveOutDir` decides is safe.
 */
export function pullEvents({ dbPath, requestedOutDir, shiziEnv }: PullEventsOptions): PullEventsResult {
  const outDir = resolveOutDir({
    requestedOutDir,
    shiziEnv,
    canonicalOutDir: join(repoRoot, "data", "events"),
  });

  const store = openEventStore(dbPath);
  const events = store.getAllEvents();
  const ratings = store.getAllRatings();
  store.close();

  mkdirSync(outDir, { recursive: true });

  const eventsPath = join(outDir, "events.jsonl");
  writeFileSync(eventsPath, exportToJsonl(events));

  // adaptivity-instrumentation spec's "Parent one-tap session rating" — a
  // rating that reaches SQLite but never this file is NOT durably
  // persisted by this repo's own definition (see design.md/infra/README.md:
  // the committed JSONL, not the live SQLite volume, is the actual durable
  // backup).
  const ratingsPath = join(outDir, "ratings.jsonl");
  writeFileSync(ratingsPath, toJsonl(ratings));

  return { outDir, eventsCount: events.length, ratingsCount: ratings.length };
}

function parseArgs(argv: string[]): { dbPathArg: string | undefined; outDirArg: string | undefined } {
  let dbPathArg: string | undefined;
  let outDirArg: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out-dir") {
      outDirArg = argv[++i];
    } else if (dbPathArg === undefined) {
      dbPathArg = argv[i];
    }
  }
  return { dbPathArg, outDirArg };
}

// Only run as a script when invoked directly (`npx tsx scripts/pull-events.ts`),
// not when imported by pull-events.test.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { dbPathArg, outDirArg } = parseArgs(process.argv.slice(2));
  const dbPath = dbPathArg ?? process.env.EVENTS_DB_PATH ?? join(packageRoot, "data", "events.sqlite");

  if (!existsSync(dbPath)) {
    console.error(`No event store found at ${dbPath} — nothing to pull yet.`);
    process.exit(1);
  }

  try {
    const result = pullEvents({ dbPath, requestedOutDir: outDirArg, shiziEnv: process.env.SHIZI_ENV });
    console.log(`Wrote ${result.eventsCount} events to ${join(result.outDir, "events.jsonl")}`);
    console.log(`Wrote ${result.ratingsCount} ratings to ${join(result.outDir, "ratings.jsonl")}`);
    if (result.outDir === join(repoRoot, "data", "events")) {
      console.log("Remember to commit these files — they're the actual durable backup, not the live SQLite file.");
    } else {
      console.log(`Wrote to a non-canonical directory (${result.outDir}) — this is disposable dev data, not the durable backup.`);
    }
  } catch (err) {
    if (err instanceof CanonicalRecordGuardError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
