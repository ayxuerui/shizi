/**
 * The same set `scripts/check-precache.mjs` asserts at BUILD time — kept
 * as a separate list (not unified via a shared import) because that
 * script runs standalone against the built `dist/sw.js` outside Vite's
 * module graph, and this one runs at RUNTIME against `caches`. If you
 * change one, change the other — `check-precache.mjs`'s own header
 * comment carries the reciprocal note.
 */
export const CRITICAL_PRECACHE_PATHS: readonly string[] = [
  "fonts/LXGWWenKai-subset.woff2",
  "fonts/OFL.txt",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "audio/unlock-tone.wav",
  "audio/interaction-cue.wav",
];
