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
// Usage: npx tsx scripts/pull-events.ts [path-to-db]
//   (defaults to $EVENTS_DB_PATH, then ./data/events.sqlite)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exportToJsonl, toJsonl } from "@shizi/learner-state";
import { openEventStore } from "../src/db.js";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");

const dbPath = process.argv[2] ?? process.env.EVENTS_DB_PATH ?? join(packageRoot, "data", "events.sqlite");

if (!existsSync(dbPath)) {
  console.error(`No event store found at ${dbPath} — nothing to pull yet.`);
  process.exit(1);
}

const store = openEventStore(dbPath);
const events = store.getAllEvents();
const ratings = store.getAllRatings();
store.close();

const outDir = join(repoRoot, "data", "events");
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

console.log(`Wrote ${events.length} events to ${eventsPath}`);
console.log(`Wrote ${ratings.length} ratings to ${ratingsPath}`);
console.log("Remember to commit these files — they're the actual durable backup, not the live SQLite file.");
