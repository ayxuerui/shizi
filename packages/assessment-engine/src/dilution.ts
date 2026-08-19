export interface DilutionConfig {
  /** Easy items served per one informative probe — default 4:1 per `assessment` spec's "Felt-difficulty dilution" requirement. */
  easyPerInformative: number;
}

export const DEFAULT_DILUTION_CONFIG: DilutionConfig = { easyPerInformative: 4 };

/**
 * Per `assessment` spec's "Felt-difficulty dilution" requirement: decides
 * whether the Nth (0-indexed) served item this session should be an easy,
 * guaranteed-success item or an informative frontier probe, at
 * approximately the configured ratio. Deterministic and stateless — a
 * fixed-size repeating block (informative last in each block), not a
 * running counter that could drift from the target ratio over a long
 * session.
 */
export function isInformativeSlot(index: number, config: DilutionConfig): boolean {
  const blockSize = config.easyPerInformative + 1;
  return index % blockSize === blockSize - 1;
}

/**
 * Rotates through the easy pool (identity-set ∪ confirmed-known
 * characters, decided by the caller) rather than repeating one item, per
 * the "guaranteed-success items" scenario's plural framing. Returns null
 * only if the pool is genuinely empty (in practice this never happens —
 * the identity set alone is never empty).
 */
export function pickEasyItem(easyPool: readonly string[], cursor: number): string | null {
  if (easyPool.length === 0) return null;
  return easyPool[cursor % easyPool.length]!;
}
