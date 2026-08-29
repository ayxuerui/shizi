## ADDED Requirements

### Requirement: Learner context is the outward contract for other layers
The learner-state capability SHALL expose a learner context — a derived read model of what a
consumer is entitled to know about a learner's progress — as the supported way for other layers to
read progress. Consumers SHALL obtain progress facts from that context rather than re-deriving them
from the raw event history. The context SHALL be computed as a projection over the event log, never
stored as independently-editable state.

#### Scenario: A consumer needs to know a learner's progress
- **WHEN** another layer needs to know what the learner knows
- **THEN** it SHALL obtain a learner context from this capability, rather than reading the event
  history and computing mastery, known-set membership, or recency itself

#### Scenario: The context is derived, not stored
- **WHEN** a learner context is produced
- **THEN** it SHALL be computed from the event log at the time of the request, and no part of it SHALL
  be persisted as separately-editable state

#### Scenario: Two consumers see the same progress
- **WHEN** two different consumers request a learner context against the same event history and
  configuration
- **THEN** both SHALL receive the same progress facts

### Requirement: Learner context carries mastery, recency, and introduction ordering
A learner context SHALL report, for the units it covers: each unit's mastery state, each unit's most
recent exposure, whether a unit has ever been presented in any module, and the order in which units
were first introduced. These facts SHALL be available without the consumer inspecting individual
events.

#### Scenario: Mastery state per unit
- **WHEN** a consumer reads a learner context
- **THEN** it SHALL be able to determine each covered unit's mastery state without examining
  individual events

#### Scenario: Introduction order
- **WHEN** a consumer needs the order in which units were introduced
- **THEN** the context SHALL report that order, derived from each unit's first-ever exposure across
  every module, oldest first

#### Scenario: Exposure recency
- **WHEN** a consumer needs to know how long ago a unit was last seen
- **THEN** the context SHALL report each covered unit's most recent exposure across every module

#### Scenario: Presented but not yet measured
- **WHEN** a unit has been presented only in a module that carries no recognition evidence
- **THEN** the context SHALL report that unit as having been presented, distinctly from a unit that
  has never been presented at all, and SHALL NOT report it as having a mastery state derived from that
  presentation

### Requirement: Learner context is available offline
A learner context SHALL be derivable entirely from the event history already present on the device,
with no network connectivity, so that every consumer of it remains fully usable offline.

#### Scenario: Context requested with no connectivity
- **WHEN** a consumer requests a learner context while the device has no network connection
- **THEN** the context SHALL be produced from locally-held event history with no visible degradation
