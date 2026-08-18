import type { CandidatePool, ConfusablePair, StrokeData } from "./types.js";

/**
 * Well-known character-confusion pairs from Chinese literacy pedagogy
 * (not derived from any single copyrighted source — this is standard
 * domain knowledge taught in beginner materials). Included whenever
 * present in the pool; supplements the computed check below, which is
 * unlikely to catch every pedagogically-known pair on its own.
 */
const CURATED_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["日", "白"],
  ["小", "少"],
];

const GRID_SIZE = 4;

/** Flattens every stroke's median points into one point cloud. */
function pointCloud(strokeData: StrokeData): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const stroke of strokeData.medians) {
    for (const point of stroke) {
      points.push(point);
    }
  }
  return points;
}

/**
 * A coarse GRID_SIZE x GRID_SIZE occupancy histogram of a character's
 * point cloud, normalized to its own bounding box then to a unit sum —
 * a real, explainable geometric shape signature, not a learned/opaque
 * one, per the spec's "reviewable and correctable by a human" intent.
 */
function shapeSignature(strokeData: StrokeData): number[] {
  const points = pointCloud(strokeData);
  const grid = new Array<number>(GRID_SIZE * GRID_SIZE).fill(0);
  if (points.length === 0) return grid;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);

  for (const [x, y] of points) {
    const gx = Math.min(GRID_SIZE - 1, Math.floor(((x - minX) / width) * GRID_SIZE));
    const gy = Math.min(GRID_SIZE - 1, Math.floor(((y - minY) / height) * GRID_SIZE));
    grid[gy * GRID_SIZE + gx]! += 1;
  }

  const total = points.length;
  return grid.map((count) => count / total);
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

const SHAPE_DISTANCE_THRESHOLD = 0.35;
const MAX_STROKE_COUNT_DIFF = 1;

/**
 * Computes confusability across the whole pool: a curated list plus a
 * geometric fallback (same-ish stroke count and similar coarse shape),
 * per `character-data` spec's "Confusability relationships" requirement.
 */
export function computeConfusability(pool: CandidatePool): ConfusablePair[] {
  const pairs: ConfusablePair[] = [];
  const seen = new Set<string>();

  function addPair(a: string, b: string, reason: ConfusablePair["reason"]) {
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ a, b, reason });
  }

  for (const [a, b] of CURATED_PAIRS) {
    if (pool.has(a) && pool.has(b)) {
      addPair(a, b, "curated");
    }
  }

  const entries = [...pool.values()].filter(
    (entry) => entry.strokeData !== null && entry.strokeCount !== null,
  );
  const signatures = new Map<string, number[]>();
  for (const entry of entries) {
    signatures.set(entry.character, shapeSignature(entry.strokeData!));
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const entryA = entries[i]!;
      const entryB = entries[j]!;
      if (entryA.character === entryB.character) continue;
      const strokeDiff = Math.abs(entryA.strokeCount! - entryB.strokeCount!);
      if (strokeDiff > MAX_STROKE_COUNT_DIFF) continue;

      const distance = euclideanDistance(
        signatures.get(entryA.character)!,
        signatures.get(entryB.character)!,
      );
      if (distance <= SHAPE_DISTANCE_THRESHOLD) {
        addPair(entryA.character, entryB.character, "same-stroke-count-and-shape");
      }
    }
  }

  return pairs;
}

/** Builds a character -> confusable-character-set index from pair list. */
export function buildConfusabilityIndex(
  pairs: readonly ConfusablePair[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const { a, b } of pairs) {
    if (!index.has(a)) index.set(a, new Set());
    if (!index.has(b)) index.set(b, new Set());
    index.get(a)!.add(b);
    index.get(b)!.add(a);
  }
  return index;
}
