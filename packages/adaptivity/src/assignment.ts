import type { Arm, ArmAssignment, MatchedPair } from "./types.js";

/**
 * Looks up whether `character` already has a recorded arm assignment,
 * across a supplied assignment history — mirrors `learner-state`'s
 * `priorEvents` pattern (a caller-supplied full history, not internal
 * state). Needed by `exposure-engine`'s "existing assignment is honored"
 * requirement: an assignment must never be re-rolled once made. Returns
 * the most recently assigned match if more than one somehow exists
 * (should not happen in practice — assignment is meant to run once per
 * character — but "most recent wins" is a safe, deterministic tie-break).
 */
export function findAssignmentForCharacter(
  assignments: readonly ArmAssignment[],
  character: string,
): ArmAssignment | undefined {
  let found: ArmAssignment | undefined;
  for (const assignment of assignments) {
    if (assignment.character !== character) continue;
    if (!found || assignment.assignedAt > found.assignedAt) {
      found = assignment;
    }
  }
  return found;
}

export interface AssignmentDeps {
  now?: () => string;
  random?: () => number;
}

/**
 * Per `adaptivity-instrumentation` spec's "Matched-pair randomization
 * protocol" requirement: randomly assigns each member of a matched pair
 * to an arm, producing both assignment records together (spec: "SHALL
 * randomly assign each member... and SHALL record both assignments,
 * even if only one arm is currently implemented"). Pure/injectable
 * randomness and clock, so this is testable deterministically.
 */
export function assignPairToArms(
  pair: MatchedPair,
  arms: readonly Arm[],
  deps: AssignmentDeps = {},
): [ArmAssignment, ArmAssignment] {
  if (arms.length === 0) {
    throw new Error("assignPairToArms requires at least one configured arm");
  }
  const now = deps.now ?? (() => new Date().toISOString());
  const random = deps.random ?? Math.random;

  const [characterA, characterB] = pair.characters;
  const pairId = `${characterA}\u0000${characterB}`;
  const assignedAt = now();

  // Degenerate but valid case (this change's actual state — only
  // "hear-tap" exists): both members still get a real assignment
  // record. Data collection starts now regardless of whether there's
  // anything yet to compare it against.
  if (arms.length === 1) {
    const arm = arms[0]!;
    return [
      { character: characterA, arm, pairId, assignedAt },
      { character: characterB, arm, pairId, assignedAt },
    ];
  }

  const armForA = arms[Math.floor(random() * arms.length)]!;
  const armForB = arms[Math.floor(random() * arms.length)]!;

  return [
    { character: characterA, arm: armForA, pairId, assignedAt },
    { character: characterB, arm: armForB, pairId, assignedAt },
  ];
}

/**
 * Append-only record of arm assignments, mirroring `learner-state`'s
 * `EventLog` pattern: assignments are written once, immediately, and
 * never mutated — per the spec's "Assignment recorded before outcome is
 * known" requirement, this log has no update/delete API at all.
 */
export class AssignmentLog {
  private readonly assignments: ArmAssignment[] = [];

  record(assignment: ArmAssignment): void {
    this.assignments.push(assignment);
  }

  recordPair(assignments: readonly [ArmAssignment, ArmAssignment]): void {
    this.record(assignments[0]);
    this.record(assignments[1]);
  }

  getAssignments(): readonly ArmAssignment[] {
    return [...this.assignments];
  }

  get size(): number {
    return this.assignments.length;
  }
}
