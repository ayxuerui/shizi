## Purpose

Defines how the app decides which module runs next and which characters each module operates on, binding every activity to the single active curriculum batch so that a batch is learned, then measured, as one coherent unit.

## ADDED Requirements

### Requirement: Every module decision binds to the active batch
The rotation decision SHALL first designate a single active batch (composed from learner state and the candidate pool), then choose the module from that batch's state. Decisions for `learn`, `assess`, and `memory` SHALL carry an explicit character list; the `assess` list SHALL be the active batch's characters that still need measurement.

#### Scenario: Learn and assess reference the same batch
- **WHEN** consecutive rotation decisions occur while the active batch still has unintroduced or unresolved characters
- **THEN** those decisions SHALL reference characters from the same composed batch, not freshly re-composed membership

#### Scenario: Decision types carry character lists
- **WHEN** the rotation decides on any module
- **THEN** the resulting decision SHALL identify exactly which characters that activity operates on

### Requirement: Learn precedes assessment per batch member
Each active-batch character SHALL be introduced before it is measured. The rotation SHALL choose `learn` whenever any active-batch character has never been presented to the learner in any module or activity, and SHALL pass only the never-presented members to the learn activity.

#### Scenario: New learner starts with a learn bout
- **WHEN** a brand-new learner's rotation is decided
- **THEN** the decision SHALL be `learn` carrying the leading members of the first composed batch

#### Scenario: Exposure-only presentation counts as introduced
- **WHEN** a batch character has only ever appeared in listen/trace exposure events and has no recognition-activity history
- **THEN** the rotation SHALL NOT select it again for `learn` and SHALL treat it as ready for assessment

### Requirement: Assessment measures the active batch
Once every active-batch character has been introduced, the rotation SHALL run an assessment bout scoped to the batch's unresolved characters (those not in `known` or `shaky` mastery state), delivered as a focused session per the assessment capability.

#### Scenario: Mixed-progress batch assesses only unresolved members
- **WHEN** some active-batch characters are confirmed known while others remain unresolved
- **THEN** the assessment focus SHALL contain only the unresolved members

#### Scenario: Completed batch advances the rotation
- **WHEN** all members of the active batch have reached `known` or `shaky` mastery
- **THEN** the next rotation decision SHALL operate on the following composed batch, beginning with its learn work

### Requirement: Memory review draws from outside the active batch
The memory module reviews already-known characters whose most recent event is at least the configured threshold days old, excluding all active-batch characters, ordered stalest-first, and capped at a configured maximum per bout. When due characters exist and no memory bout has run today, memory SHALL run ahead of new-content work.

#### Scenario: Stale known character triggers memory before new content
- **WHEN** a known character outside the active batch crosses the staleness threshold and no memory bout has run today
- **THEN** the rotation SHALL decide `memory` before any `learn` or `assess` work

#### Scenario: Active batch is excluded from the due-list
- **WHEN** the memory due-list is computed while a batch is active
- **THEN** no active-batch character SHALL appear in the memory bout's character list

### Requirement: Rotation decisions are deterministic projections
Rotation decisions SHALL be pure functions of the event history, candidate pool, configuration, and injected date inputs. The same inputs SHALL always produce the same decision, no hidden cursor SHALL persist between decisions, and the decision SHALL be recomputed after each completed activity.

#### Scenario: Replaying history reproduces the decision
- **WHEN** the rotation is decided twice from the same event log, pool, config, and dates
- **THEN** both runs SHALL yield identical decisions

#### Scenario: Decision refreshes after each activity
- **WHEN** an activity bout completes
- **THEN** the next decision SHALL be recomputed from the updated event history rather than read from stored next-up state
