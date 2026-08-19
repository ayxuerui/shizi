#!/usr/bin/env node
// Regenerates src/data/tags.ts from data/tagging-review.csv (task 3.3).
//
// Usage: node packages/character-data/scripts/build-tags.mjs
//
// Column convention: a column named exactly "concreteness"/"pictographic"
// is treated as human-reviewed (tagSource: "reviewed"); the current
// "concreteness_DRAFT"/"pictographic_DRAFT" columns are treated as
// unreviewed (tagSource: "draft") per the character-data spec's "Human-
// supplied concreteness tag" scenario — a generated draft is not a
// manually supplied tag, so it must not be silently presented as
// authoritative. When the parent's review comes back, either rename the
// columns to the non-suffixed form in the CSV, or edit values in place
// and rename the header — then re-run this script; no code change here
// is needed either way.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const csvPath = join(repoRoot, "data", "tagging-review.csv");
const outPath = join(here, "..", "src", "data", "tags.ts");

/** Minimal CSV line splitter: handles double-quoted fields (the only
 * quoting this file uses, for the free-text `notes` column) without
 * pulling in a dependency for a 209-row internal data file. */
function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const fields = splitCsvLine(line);
    const row = {};
    header.forEach((name, index) => {
      row[name] = fields[index] ?? "";
    });
    return row;
  });
}

function parseConcreteness(raw) {
  if (raw === "concrete" || raw === "abstract") return raw;
  throw new Error(`Unrecognized concreteness value: ${JSON.stringify(raw)}`);
}

function parsePictographic(raw) {
  if (raw === "yes") return true;
  if (raw === "no") return false;
  throw new Error(`Unrecognized pictographic value: ${JSON.stringify(raw)}`);
}

const csvText = readFileSync(csvPath, "utf8");
const rows = parseCsv(csvText);

const tags = {};
for (const row of rows) {
  const character = row["character"];
  if (!character) continue;

  const hasReviewedConcreteness = "concreteness" in row && row["concreteness"] !== "";
  const hasReviewedPictographic = "pictographic" in row && row["pictographic"] !== "";
  const concretenessRaw = hasReviewedConcreteness ? row["concreteness"] : row["concreteness_DRAFT"];
  const pictographicRaw = hasReviewedPictographic ? row["pictographic"] : row["pictographic_DRAFT"];
  // A row's tagSource is "reviewed" only once BOTH fields come from a
  // reviewed column — a half-reviewed row is still draft, since the spec's
  // authoritative/manually-supplied line applies per attribute value, and
  // treating a half-corrected row as fully authoritative would be wrong.
  const tagSource = hasReviewedConcreteness && hasReviewedPictographic ? "reviewed" : "draft";

  tags[character] = {
    concreteness: parseConcreteness(concretenessRaw),
    pictographic: parsePictographic(pictographicRaw),
    tagSource,
  };
}

const generatedAt = new Date().toISOString().slice(0, 10);
const banner = `// Generated from data/tagging-review.csv by
// packages/character-data/scripts/build-tags.mjs — do not hand-edit.
// Regenerate: node packages/character-data/scripts/build-tags.mjs
//
// Per task 3.3 (character-data spec's "Human-supplied concreteness tag"
// scenario): a manually supplied tag is authoritative; a generated draft
// is not. Every row's tagSource distinguishes the two so this can never
// be silently presented as authoritative before the parent's review
// lands — see data/TAGGING-REVIEW.md for the review workflow.
//
// Last generated: ${generatedAt}
`;

const body = `${banner}export default ${JSON.stringify(tags, null, 2)};\n`;

writeFileSync(outPath, body);
console.log(`Wrote ${Object.keys(tags).length} tag entries to ${outPath}`);
