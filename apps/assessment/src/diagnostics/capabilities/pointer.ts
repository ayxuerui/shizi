import type { PointerDecisionRecord } from "../../input/pointer-gate.js";

export interface PalmRejectionSummary {
  penEvents: number;
  touchAccepted: number;
  touchRejectedWhilePenActive: number;
}

/**
 * Pure summarizer over `PointerGate.subscribe`'s decision stream — task
 * 10.0 item (c). The gate's `shouldAccept` verdicts alone can't show
 * "14 palm touches were rejected during that two-handed run"; this can.
 * Genuinely testable: whether iOS actually delivers `pointerType: "pen"`
 * before a real palm's `touch` on a specific device/Pencil generation is
 * not — that's `PenPalmProbe.tsx`'s job, judged by a human watching it.
 */
export function summarizeDecisions(records: readonly PointerDecisionRecord[]): PalmRejectionSummary {
  let penEvents = 0;
  let touchAccepted = 0;
  let touchRejectedWhilePenActive = 0;

  for (const record of records) {
    // "down" only — a real tap emits `shouldAccept`'s "decide" phase on
    // BOTH pointerdown and pointerup (see use-tap.ts), so counting every
    // pen-tagged record regardless of phase would count one physical
    // pen contact as 2-4 "events." "down" is one count per contact.
    if (record.phase === "down" && record.pointerType === "pen") penEvents += 1;
    if (record.phase === "decide" && record.pointerType === "touch") {
      if (record.accepted) touchAccepted += 1;
      else if (record.penActive) touchRejectedWhilePenActive += 1;
    }
  }

  return { penEvents, touchAccepted, touchRejectedWhilePenActive };
}
