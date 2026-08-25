// One-time migration for the canonical record
// (`rename-event-modality-to-activity` design decision 4): rewrites
// data/events/events.jsonl from the retired event schema — field
// `modality`, values `expose-listen`/`expose-trace`/`hear-tap` — to the
// unified `module`/`activity` schema. Every original line is preserved
// verbatim in a `.bak` sibling written BEFORE anything is modified; the
// script refuses to run if that `.bak` already exists, so a second run
// can never double-translate or overwrite the only original copy.
//
// Backfill mapping (documented imprecision — see design decision 4):
//   expose-listen → module "learn",    activity "listen"
//   expose-trace  → module "learn",    activity "trace"
//   hear-tap      → module "assess",   activity "hear-tap"
// Every line is validated with learner-state's own validateEvent after
// translation — a line that would not validate aborts the run before
// the output file is touched.
//
// Usage: npx tsx scripts/translate-events-jsonl.ts [path-to-jsonl]
//   (defaults to the repo's data/events/events.jsonl)

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvent, type LearnerEvent } from "@shizi/learner-state";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const defaultPath = join(repoRoot, "data", "events", "events.jsonl");

const inputPath = process.argv[2] ?? defaultPath;
const backupPath = `${inputPath}.pre-activity-rename.bak`;

if (!existsSync(inputPath)) {
  console.error(`No canonical record at ${inputPath} — nothing to translate.`);
  process.exit(1);
}
if (existsSync(backupPath)) {
  console.error(
    `${backupPath} already exists — this migration has run (or was started) before. ` +
      "Refusing to overwrite the only original copy. Restore from the .bak and delete it first if you truly need a re-run.",
  );
  process.exit(1);
}

const lines = readFileSync(inputPath, "utf8")
  .split("\n")
  .filter((line) => line.trim().length > 0);

const mapping: Record<string, { module: LearnerEvent["module"]; activity: LearnerEvent["activity"] }> = {
  "expose-listen": { module: "learn", activity: "listen" },
  "expose-trace": { module: "learn", activity: "trace" },
  "hear-tap": { module: "assess", activity: "hear-tap" },
};

const translated: string[] = [];
for (const line of lines) {
  const raw = JSON.parse(line) as LearnerEvent & { modality?: string };
  if (!("modality" in raw) || typeof raw.modality !== "string") {
    // Already in the new shape (or foreign) — keep the line untouched.
    translated.push(line);
    continue;
  }
  const mapped = mapping[raw.modality];
  if (!mapped) {
    console.error(`Unrecognized legacy modality "${raw.modality}" on event ${raw.id} — aborting, nothing written.`);
    process.exit(1);
  }
  const { modality: _retired, ...rest } = raw;
  const event = { ...rest, ...mapped } as LearnerEvent;
  const result = validateEvent(event);
  if (!result.valid) {
    console.error(`Translated event ${raw.id} does not validate: ${result.errors.join("; ")} — aborting, nothing written.`);
    process.exit(1);
  }
  translated.push(JSON.stringify(event));
}

copyFileSync(inputPath, backupPath);
writeFileSync(inputPath, translated.length > 0 ? translated.join("\n") + "\n" : "");
console.log(
  `Translated ${translated.length} line(s) in ${inputPath}; original preserved at ${backupPath}.`,
);
