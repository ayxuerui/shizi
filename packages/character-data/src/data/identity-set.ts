import type { IdentitySetEntry } from "../types.js";

/**
 * The learner's personal name and household nickname, per
 * `character-data` spec's "Identity set is distinct from the productive
 * set" requirement: characters here are always permitted regardless of
 * known-set, and are never selected by the curriculum sequencer as a new
 * productive target (see `curriculum` spec).
 *
 * 薛亦霖 (surname + given name) and 小蓝莓 (household nickname, "little
 * blueberry"). Confirmed with the parent during project planning.
 */
export const IDENTITY_SET: readonly IdentitySetEntry[] = [
  { character: "薛", role: "surname" },
  { character: "亦", role: "given-name" },
  { character: "霖", role: "given-name" },
  { character: "小", role: "nickname" },
  { character: "蓝", role: "nickname" },
  { character: "莓", role: "nickname" },
];

export const IDENTITY_CHARACTERS: ReadonlySet<string> = new Set(
  IDENTITY_SET.map((entry) => entry.character),
);

export function isIdentityCharacter(character: string): boolean {
  return IDENTITY_CHARACTERS.has(character);
}
