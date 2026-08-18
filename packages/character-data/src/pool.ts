import type { CandidatePool, CharacterAttributes, StrokeData } from "./types.js";
import poolMembership from "./data/pool-membership.js";
import strokeDataRaw from "./data/stroke-data.js";
import { IDENTITY_SET } from "./data/identity-set.js";

interface PoolMembershipFile {
  pool: string[];
  phaseA: string[];
  identitySet: string[];
  deferredTier2: string[];
  frequencyRank: Record<string, number | null>;
}

/** Raw shape as it exists in JSON — medians are plain number[][][], not
 * tuples, since JSON has no tuple type. Converted to StrokeData's
 * [number, number] tuples explicitly below, not cast unsafely. */
interface RawStrokeEntry {
  strokes: string[];
  medians: number[][][];
}

const membership = poolMembership as PoolMembershipFile;
const strokeData = strokeDataRaw as Record<string, RawStrokeEntry>;

function toMedianTuples(medians: number[][][]): Array<Array<[number, number]>> {
  return medians.map((stroke) =>
    stroke.map((point) => {
      const [x, y] = point;
      if (x === undefined || y === undefined) {
        throw new Error(`Malformed median point: ${JSON.stringify(point)}`);
      }
      return [x, y] as [number, number];
    }),
  );
}

/**
 * Characters intentionally excluded from the current pool during
 * curation (task 3.1's second trim pass) but not rejected outright —
 * reasonable candidates for a later expansion once the initial pool is
 * in active use. Exposed so this isn't a silent, undiscoverable cut.
 */
export const DEFERRED_TIER_2: readonly string[] = membership.deferredTier2;

/**
 * Personal-relevance is optional (not one of the spec's 5 required
 * fields), so it's reasonable to seed it directly from decisions already
 * documented elsewhere in this project rather than wait for task 3.3 —
 * unlike concreteness/pictographic, these aren't linguistic judgment
 * calls, they're facts about what THIS product already committed to
 * caring about (family vocabulary, the 西游记 theme). Scale: 0 (neutral)
 * to 1 (maximally relevant); everything not listed defaults to 0, not
 * null — there's no pending human-tagging step for this field.
 */
const PERSONAL_RELEVANCE: ReadonlyMap<string, number> = new Map([
  // 西游记 theme — the whole narrative wrapper.
  ["悟", 0.8],
  ["空", 0.8],
  // Family vocabulary.
  ["妈", 0.7],
  ["爸", 0.7],
  ["姐", 0.5],
  ["哥", 0.5],
  ["弟", 0.5],
  ["妹", 0.5],
  ["奶", 0.5],
  ["爷", 0.5],
  ["姥", 0.5],
]);

function buildAttributes(character: string): CharacterAttributes {
  const raw = strokeData[character];
  const strokeDataEntry: StrokeData | null = raw
    ? { strokes: raw.strokes, medians: toMedianTuples(raw.medians) }
    : null;

  return {
    character,
    frequencyRank: membership.frequencyRank[character] ?? null,
    // Human-tagged; not yet supplied (task 3.3). See exclusion.ts — a
    // character missing this is correctly excluded from selection until
    // a hand-tagging pass fills it in, not a bug.
    concreteness: null,
    pictographic: null,
    strokeCount: strokeDataEntry ? strokeDataEntry.strokes.length : null,
    strokeData: strokeDataEntry,
    personalRelevance: PERSONAL_RELEVANCE.get(character) ?? 0,
  };
}

/**
 * Assembles the full candidate pool: the productive set (task 3.1's
 * curated ~200) plus the identity set, each with whatever attributes are
 * currently available (stroke data — mechanical, complete; concreteness/
 * pictographic — pending task 3.3's hand-tagging pass; frequencyRank —
 * complete for HSK-1-sourced characters, null for the few thematic
 * additions that aren't in that source).
 */
export function assembleCandidatePool(): CandidatePool {
  const pool = new Map<string, CharacterAttributes>();

  for (const character of membership.pool) {
    pool.set(character, buildAttributes(character));
  }
  for (const entry of IDENTITY_SET) {
    if (!pool.has(entry.character)) {
      pool.set(entry.character, buildAttributes(entry.character));
    }
  }

  return pool;
}

export { PHASE_A_SEQUENCE } from "./data/phase-a.js";
export { IDENTITY_SET, IDENTITY_CHARACTERS, isIdentityCharacter } from "./data/identity-set.js";
