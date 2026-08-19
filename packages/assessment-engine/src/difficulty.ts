import type { CandidatePool } from "@shizi/character-data";
import { isUsable } from "@shizi/character-data";

/**
 * Per `assessment` spec's "Adaptive frontier-search probing" requirement:
 * a coarse difficulty ordering (0 = easiest, 1 = hardest) over the usable
 * productive pool, used to spread initial probes across a wide range and
 * then narrow toward the discovered boundary. Blends two real
 * per-character signals already in the pool — frequencyRank (rarer =
 * harder) and strokeCount (more strokes = harder) — rather than
 * fabricating a new one. This is explicitly a coarse proxy, not a
 * learned difficulty model (that's Loop 3/inference territory, out of
 * scope here — same "flag the gap, don't fabricate" discipline as
 * `curriculum`'s word-unlock/story-unlock stubs).
 *
 * Only characters passing `isUsable` (frequencyRank, strokeCount, etc.
 * all present) get a difficulty value. Identity-set characters and any
 * not-yet-tagged candidate are deliberately absent from this index —
 * they're still probe candidates (see `frontier.ts` and design.md's
 * "Identity characters bypass the exclusion gate for probe selection"
 * entry), just not through this difficulty axis.
 */
export function computeDifficultyIndex(pool: CandidatePool): ReadonlyMap<string, number> {
  const usableEntries = [...pool.values()].filter(isUsable);
  if (usableEntries.length === 0) return new Map();

  const frequencyRanks = usableEntries.map((entry) => entry.frequencyRank!);
  const strokeCounts = usableEntries.map((entry) => entry.strokeCount!);
  const minFreq = Math.min(...frequencyRanks);
  const maxFreq = Math.max(...frequencyRanks);
  const minStrokes = Math.min(...strokeCounts);
  const maxStrokes = Math.max(...strokeCounts);

  const normalize = (value: number, min: number, max: number): number =>
    max === min ? 0 : (value - min) / (max - min);

  const difficulty = new Map<string, number>();
  for (const entry of usableEntries) {
    const frequencyDifficulty = normalize(entry.frequencyRank!, minFreq, maxFreq);
    const strokeDifficulty = normalize(entry.strokeCount!, minStrokes, maxStrokes);
    difficulty.set(entry.character, 0.5 * frequencyDifficulty + 0.5 * strokeDifficulty);
  }
  return difficulty;
}
