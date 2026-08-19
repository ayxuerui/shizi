#!/usr/bin/env node
// Task 8.1: post-build guard. Asserts the built service worker's
// precache manifest actually contains the font subset, its OFL license
// file, the PWA icons, and the placeholder audio clips — a cheap
// regression check against silently dropping an asset from
// vite.config.ts's `workbox.globPatterns` (e.g. a future contributor
// narrowing the pattern for an unrelated reason and quietly losing
// offline coverage for one of these).
//
// Run automatically as part of `npm run build` (see package.json).
//
// src/diagnostics/critical-assets.ts's CRITICAL_PRECACHE_PATHS asserts
// the same set at RUNTIME (against the live `caches` API on a real
// device) — kept as a separate list rather than a shared import, since
// this script runs standalone against the built dist/sw.js outside
// Vite's module graph. If you change one, change the other.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..", "dist");
const swPath = join(distDir, "sw.js");

if (!existsSync(swPath)) {
  console.error(`check-precache: ${swPath} does not exist — did the build run?`);
  process.exit(1);
}

const swContents = readFileSync(swPath, "utf8");

const REQUIRED_SUBSTRINGS = [
  "LXGWWenKai-subset.woff2",
  "fonts/OFL.txt",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "audio/unlock-tone.wav",
  "audio/interaction-cue.wav",
];

const missing = REQUIRED_SUBSTRINGS.filter((needle) => !swContents.includes(needle));

if (missing.length > 0) {
  console.error("check-precache: the built service worker is missing required precache entries:");
  for (const entry of missing) console.error(`  - ${entry}`);
  console.error("Check vite.config.ts's workbox.globPatterns and that these files exist under public/.");
  process.exit(1);
}

console.log(`check-precache: all ${REQUIRED_SUBSTRINGS.length} required assets are present in the precache manifest.`);
