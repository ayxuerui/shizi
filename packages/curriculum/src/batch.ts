import type { CandidatePool } from "@shizi/character-data";
import { selectNextCharacter } from "./select.js";
import { DEFAULT_CURRICULUM_CONFIG, type ComposedBatch, type CurriculumConfig, type CurriculumState } from "./types.js";

/**
 * Composes one batch of `config.batchSize` not-yet-known characters by
 * repeatedly calling `selectNextCharacter` and carrying the pick forward
 * into a simulated known-set/recently-introduced window — the same
 * provisional-state loop `infra/sync-service/scripts/publish-config.ts`
 * used to inline directly. `selectNextCharacter` remains the only
 * selection primitive; this just sequences it. Each pick also accumulates
 * into a local `pickedInBatch` set (starting empty per call, so it never
 * leaks across batch boundaries), which `selectNextCharacter` enforces as
 * a hard confusability exclusion independent of `recentWindowSize` —
 * per `add-batch-scoped-activities` spec: intra-batch non-confusability
 * holds even when `batchSize > recentWindowSize`.
 *
 * Per `add-batched-curriculum-tagging` spec: stops early (a `short`
 * batch) rather than violating the spacing constraint or fabricating a
 * candidate when the pool runs out of eligible characters.
 */
export function composeBatch(
  pool: CandidatePool,
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  config: CurriculumConfig = DEFAULT_CURRICULUM_CONFIG,
): ComposedBatch {
  const characters: string[] = [];
  let simulatedKnown = new Set(state.knownSet);
  let recentlyIntroduced = [...state.recentlyIntroduced];
  const pickedInBatch = new Set<string>();
  let reason: string | undefined;

  for (let i = 0; i < config.batchSize; i++) {
    const result = selectNextCharacter(
      pool,
      { knownSet: simulatedKnown, recentlyIntroduced, pickedInBatch },
      confusabilityIndex,
      config,
    );
    if (result.status === "none-eligible") {
      reason = result.reason;
      break;
    }
    characters.push(result.character);
    simulatedKnown = new Set(simulatedKnown).add(result.character);
    recentlyIntroduced = [...recentlyIntroduced, result.character].slice(-config.recentWindowSize);
    pickedInBatch.add(result.character);
  }

  return {
    characters,
    short: characters.length < config.batchSize,
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Composes `config.batchLookahead` consecutive batches, carrying
 * provisional state across batch boundaries so later batches never
 * repeat an earlier batch's picks. Stops early (a shorter plan) once a
 * batch comes back empty — nothing eligible remains at all.
 */
export function composeBatchPlan(
  pool: CandidatePool,
  state: CurriculumState,
  confusabilityIndex: ReadonlyMap<string, ReadonlySet<string>>,
  config: CurriculumConfig = DEFAULT_CURRICULUM_CONFIG,
): ComposedBatch[] {
  const plan: ComposedBatch[] = [];
  let simulatedKnown = new Set(state.knownSet);
  let recentlyIntroduced = [...state.recentlyIntroduced];

  for (let i = 0; i < config.batchLookahead; i++) {
    const batch = composeBatch(pool, { knownSet: simulatedKnown, recentlyIntroduced }, confusabilityIndex, config);
    plan.push(batch);
    if (batch.characters.length === 0) break;

    simulatedKnown = new Set(simulatedKnown);
    for (const character of batch.characters) simulatedKnown.add(character);
    recentlyIntroduced = [...recentlyIntroduced, ...batch.characters].slice(-config.recentWindowSize);
  }

  return plan;
}
