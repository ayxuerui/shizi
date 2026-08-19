// Task 9.4: repo-side config publishing. Reads data/events/events.jsonl
// (produced by pull-events.ts), computes this learner's current
// known-set + a ranked next-targets list (curriculum's Loop 1 — a SLOW
// loop per design.md's fast/slow-loop table, deliberately NOT recomputed
// client-side), and bundles the probe pool + difficulty params, into
// apps/assessment/public/config.json.
//
// apps/assessment itself only consumes probePool + difficultyParams
// (see src/session/published-config.ts) — knownSet/nextTargets are
// published here for a FUTURE consumer (e.g. printed-reader), which
// doesn't exist yet in this change's scope, per proposal.md. Flagged,
// not silently dropped — same discipline as curriculum's own
// word-unlock/story-unlock stubs.
//
// Usage: npx tsx scripts/publish-config.ts

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleCandidatePool, buildConfusabilityIndex, computeConfusability } from "@shizi/character-data";
import type { CharacterAttributes } from "@shizi/character-data";
import { computeKnownSet, computeMasteryStates, parseJsonl } from "@shizi/learner-state";
import { DEFAULT_CURRICULUM_CONFIG, selectNextCharacter } from "@shizi/curriculum";
import { DEFAULT_ASSESSMENT_SESSION_CONFIG } from "@shizi/assessment-engine";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");

const eventsPath = join(repoRoot, "data", "events", "events.jsonl");
const events = existsSync(eventsPath) ? parseJsonl(readFileSync(eventsPath, "utf8")) : [];
if (!existsSync(eventsPath)) {
  console.warn(`No ${eventsPath} yet — publishing config.json against an empty history (run pull-events.ts first for a real one).`);
}

const masteryStates = computeMasteryStates(events);
const knownSet = computeKnownSet(masteryStates);

const pool = assembleCandidatePool();
const confusabilityIndex = buildConfusabilityIndex(computeConfusability(pool));

// A ranked "next targets" list (not just the single top pick): greedily
// simulate introducing each successive pick as already-known, so a
// future consumer gets a real short-term plan rather than one lonely
// value it would have to re-derive itself.
const NEXT_TARGETS_COUNT = 10;
const nextTargets: string[] = [];
let simulatedKnown = new Set(knownSet);
let recentlyIntroduced: string[] = [];
for (let i = 0; i < NEXT_TARGETS_COUNT; i++) {
  const result = selectNextCharacter(
    pool,
    { knownSet: simulatedKnown, recentlyIntroduced },
    confusabilityIndex,
    DEFAULT_CURRICULUM_CONFIG,
  );
  if (result.status === "none-eligible") break;
  nextTargets.push(result.character);
  simulatedKnown = new Set(simulatedKnown).add(result.character);
  recentlyIntroduced = [...recentlyIntroduced, result.character].slice(-DEFAULT_CURRICULUM_CONFIG.recentWindowSize);
}

const probePool: Record<string, CharacterAttributes> = Object.fromEntries(pool.entries());

const config = {
  generatedAt: new Date().toISOString(),
  // Loop 1 (curriculum's teaching sequencer) data — published for a
  // future consumer, not read by apps/assessment itself. See this
  // script's header comment and design.md.
  knownSet: [...knownSet],
  nextTargets,
  // What apps/assessment actually reads (src/session/published-config.ts):
  probePool,
  difficultyParams: {
    guessDetection: DEFAULT_ASSESSMENT_SESSION_CONFIG.guessDetection,
    dilution: DEFAULT_ASSESSMENT_SESSION_CONFIG.dilution,
    calibration: DEFAULT_ASSESSMENT_SESSION_CONFIG.calibration,
    optionCount: DEFAULT_ASSESSMENT_SESSION_CONFIG.optionCount,
  },
};

const outPath = join(repoRoot, "apps", "assessment", "public", "config.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(
  `Wrote ${outPath}: ${knownSet.size} known, ${nextTargets.length} next targets, ${Object.keys(probePool).length} pool entries.`,
);
