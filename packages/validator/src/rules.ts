import type { Finding, ValidationContext, ValidatorConfig } from "./types.js";
import { hanCharacterOccurrences } from "./han-characters.js";

export function checkWhitelist(text: string, context: ValidationContext): Finding[] {
  const permitted = new Set([...context.identitySet, ...context.knownSet, ...context.newTargets]);
  const findings: Finding[] = [];

  for (const { character, index } of hanCharacterOccurrences(text)) {
    if (!permitted.has(character)) {
      findings.push({
        rule: "whitelist",
        severity: "error",
        message: `character "${character}" is not in the learner's identity set, known set, or declared new targets`,
        character,
        location: index,
      });
    }
  }

  return findings;
}

export function checkRepetitionThreshold(
  text: string,
  context: ValidationContext,
  config: ValidatorConfig,
): Finding[] {
  const counts = new Map<string, number>();
  for (const { character } of hanCharacterOccurrences(text)) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }

  const findings: Finding[] = [];
  for (const target of context.newTargets) {
    const count = counts.get(target) ?? 0;
    if (count < config.minRepetitionForNewTarget) {
      findings.push({
        rule: "repetition-threshold",
        severity: "error",
        message: `new target "${target}" appears ${count} time(s), below the required minimum of ${config.minRepetitionForNewTarget}`,
        character: target,
      });
    }
  }
  return findings;
}

export function checkDensity(
  text: string,
  context: ValidationContext,
  config: ValidatorConfig,
): Finding[] {
  const occurrences = hanCharacterOccurrences(text);
  if (occurrences.length === 0) return [];

  const newTargetOccurrences = occurrences.filter((o) => context.newTargets.has(o.character));
  const actualDensity = newTargetOccurrences.length / occurrences.length;

  if (actualDensity > config.maxNewCharacterDensity) {
    return [
      {
        rule: "density",
        severity: "error",
        message: `new-target characters are ${(actualDensity * 100).toFixed(1)}% of the text, exceeding the allowed maximum of ${(config.maxNewCharacterDensity * 100).toFixed(1)}%`,
      },
    ];
  }
  return [];
}

/**
 * Interpretation decision: the spec says warn when shaky-character
 * seeding is "absent or off-target" but doesn't define the tolerance
 * band for "off-target." Chosen band: warn if actual density is zero
 * (the spec's explicit scenario), or diverges from the configured target
 * by more than 2x in either direction — loose enough to not nag over
 * every minor variation, tight enough to catch a story that's clearly
 * not doing any review seeding at all.
 */
export function checkShakySeeding(text: string, context: ValidationContext, config: ValidatorConfig): Finding[] {
  const occurrences = hanCharacterOccurrences(text);
  if (occurrences.length === 0) return [];

  const shakyOccurrences = occurrences.filter((o) => context.shakySet.has(o.character));
  const actualDensity = shakyOccurrences.length / occurrences.length;
  const target = config.targetShakyDensity;

  if (actualDensity === 0) {
    return [
      {
        rule: "shaky-seeding",
        severity: "warning",
        message: "text contains no characters from the learner's shaky set — consider seeding at least one for review",
      },
    ];
  }
  if (actualDensity < target / 2 || actualDensity > target * 2) {
    return [
      {
        rule: "shaky-seeding",
        severity: "warning",
        message: `shaky-character density is ${(actualDensity * 100).toFixed(1)}%, off the target of ~${(target * 100).toFixed(1)}%`,
      },
    ];
  }
  return [];
}

export function checkConfusableAdjacency(text: string, context: ValidationContext): Finding[] {
  if (!context.confusabilityIndex) return [];

  const findings: Finding[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    const a = text[i]!;
    const b = text[i + 1]!;
    if (context.confusabilityIndex.get(a)?.has(b)) {
      findings.push({
        rule: "confusable-adjacency",
        severity: "warning",
        message: `confusable pair "${a}" and "${b}" appear immediately adjacent`,
        location: i,
      });
    }
  }
  return findings;
}
