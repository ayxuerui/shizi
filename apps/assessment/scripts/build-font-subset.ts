// Task 8.1: builds the real, license-cleared LXGW WenKai font subset
// this app ships, from a source TTF the caller supplies. Run via:
//
//   npm run build:font -- /path/to/LXGWWenKai-Regular.ttf
//
// (vite-node, not plain node — this script imports real TS source from
// @shizi/character-data and this app's own src/copy.ts, which plain
// Node can't resolve without a loader; vite-node transforms on the fly,
// the same reason apps/assessment itself never needs a separate build
// step during dev.)
//
// Source: https://github.com/lxgw/LxgwWenKai — the repo `data/PROVENANCE.md`
// actually verified (task 2.2), NOT the separate "Lite" variant used by
// the `spikes/pdf-render` P0 spike for convenience; this script uses the
// exact source whose license was cleared. SIL OFL 1.1, GO per
// data/PROVENANCE.md — the Arphic-license precedent in
// packages/character-data/src/data/CHANGES.md is the model for this
// script's own "how and when modified" record (subset-manifest.json,
// written alongside the output).
//
// Download the source (not committed — only the subsetted OUTPUT is):
//   curl -L -o /tmp/LXGWWenKai-Regular.ttf \
//     https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Regular.ttf
//   curl -L -o public/fonts/OFL.txt \
//     https://raw.githubusercontent.com/lxgw/LxgwWenKai/v1.522/OFL.txt

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
// Namespace import, not default: opentype.js's CJS build also exposes a
// (differently-shaped) `default` key that ESM default-interop can pick
// up instead of the real module.exports — `* as` avoids that ambiguity.
import * as opentype from "opentype.js";
import { assembleCandidatePool, IDENTITY_CHARACTERS } from "@shizi/character-data";
import { collectCopyCharacters } from "../src/copy.js";

const SOURCE_REPO = "https://github.com/lxgw/LxgwWenKai";
const SOURCE_RELEASE = "v1.522";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

// Everything the app could ever need to render, beyond the pool/identity
// set: digits, basic Latin (debug/dev UI, future English copy), and the
// CJK/half-width punctuation this project's own copy actually uses.
const ASCII_AND_PUNCTUATION =
  " !\"'(),-.0123456789:;?ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz！？：；“”‘’（）、";

function collectRequiredCharacters(): Set<string> {
  const characters = new Set<string>();
  const pool = assembleCandidatePool();
  for (const character of pool.keys()) characters.add(character);
  for (const character of IDENTITY_CHARACTERS) characters.add(character);
  for (const character of collectCopyCharacters()) characters.add(character);
  for (const character of ASCII_AND_PUNCTUATION) characters.add(character);
  return characters;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function main(): Promise<void> {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error("Usage: npm run build:font -- <path-to-source-ttf>");
    console.error(`Download the source from ${SOURCE_REPO}/releases/tag/${SOURCE_RELEASE} — see this file's header comment.`);
    process.exit(1);
  }

  const required = collectRequiredCharacters();
  const sourceBuffer = readFileSync(sourcePath);

  // Verify BEFORE subsetting: does the source font actually contain every
  // required codepoint? This is the failure mode that actually matters —
  // tofu from characters the font never had — not a bug in harfbuzz's
  // subsetting itself, which reliably preserves whatever glyphs exist in
  // the source for the requested text.
  const sourceFont = opentype.parse(toArrayBuffer(sourceBuffer));
  const missing: string[] = [];
  for (const character of required) {
    const glyph = sourceFont.charToGlyph(character);
    if (!glyph || glyph.index === 0) missing.push(character);
  }
  if (missing.length > 0) {
    console.error(`Source font is missing ${missing.length} required character(s): ${missing.join("")}`);
    process.exit(1);
  }

  const text = [...required].join("");
  const subsetBuffer = await subsetFont(sourceBuffer, text, { targetFormat: "woff2" });

  const outDir = join(appRoot, "public", "fonts");
  const outPath = join(outDir, "LXGWWenKai-subset.woff2");
  writeFileSync(outPath, subsetBuffer);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: `LXGW WenKai (Regular weight) — ${SOURCE_REPO}, release ${SOURCE_RELEASE}`,
    license: "SIL Open Font License 1.1 — see OFL.txt alongside this file",
    characterCount: required.size,
    outputBytes: subsetBuffer.length,
    modification:
      "Subsetted (glyph closure only, via harfbuzz/subset-font) to this project's candidate pool + identity set + UI copy (src/copy.ts) + ASCII/punctuation. No glyph designs altered — see this script for the exact character-set derivation.",
  };
  writeFileSync(join(outDir, "subset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${outPath} (${subsetBuffer.length} bytes, ${required.size} characters)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
