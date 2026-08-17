## Purpose

Provides a canonical, recomputable record of what a learner knows and how she is progressing, so every other capability (curriculum, content-validator, assessment, and future authoring tools) reads from a single source of truth that survives device loss, storage eviction, and future changes to how mastery is modeled.

## ADDED Requirements

### Requirement: Event log is append-only and canonical
The system SHALL treat a per-learner event log as the sole source of truth for learning history. No component SHALL mutate or delete a previously written event. All derived state (known-set, mastery, difficulty parameters) SHALL be computed as a projection over the event log, not stored as independently-editable state.

#### Scenario: Projection recomputed after model change
- **WHEN** the mastery-state computation logic changes
- **THEN** replaying the existing event log through the new logic SHALL produce a complete, valid projection without requiring any event to be re-collected

#### Scenario: No destructive writes
- **WHEN** any component (client or server) attempts to alter or remove an existing event
- **THEN** the system SHALL reject the operation; only append is permitted

### Requirement: Event schema captures interaction context
Every learner-interaction event SHALL record, at minimum: a unique event identifier, timestamp, session identifier, the character or item involved, the activity/modality that produced it, the outcome, response latency, and contextual fields (position within session, prior exposure count for that character, days since last exposure to that character, time of day, and whether a parent was present).

#### Scenario: Event missing a required field
- **WHEN** an event is submitted without one of the required fields
- **THEN** the system SHALL reject the event and SHALL NOT write a partial record

#### Scenario: Event recorded with full context
- **WHEN** a learner interacts with a character in any activity
- **THEN** the system SHALL persist one event containing all required fields listed above

### Requirement: Known-set and mastery projection
The system SHALL derive, for every character in the candidate pool, a mastery state of `unseen`, `probing`, `known`, or `shaky`, computed from the event log. A character SHALL transition to `known` only after at least two consecutive correct responses with response latency below the configured guess-detection threshold. A character previously `known` SHALL transition to `shaky` on any incorrect response or any correct response with latency above the configured slow-response threshold.

#### Scenario: Two fast correct responses promote to known
- **WHEN** a character has at least two consecutive correct responses, each with latency below the guess-detection threshold
- **THEN** its mastery state SHALL be `known`

#### Scenario: A single miss demotes a known character
- **WHEN** a character in state `known` receives an incorrect response
- **THEN** its mastery state SHALL transition to `shaky`

#### Scenario: Slow correct response does not count toward known
- **WHEN** a character receives a correct response with latency above the guess-detection threshold
- **THEN** that response SHALL NOT count toward the two-consecutive-correct requirement for promotion to `known`

### Requirement: Offline durability and idempotent sync
The client SHALL queue events locally when offline and SHALL be fully usable with no network connectivity. Each event SHALL carry a client-generated identifier such that re-sending the same event after a retry or reconnect SHALL NOT create a duplicate record.

#### Scenario: Event created while offline
- **WHEN** the client records an event with no network connection available
- **THEN** the event SHALL be queued locally and the activity SHALL proceed without any visible degradation

#### Scenario: Duplicate sync attempt
- **WHEN** the client re-submits an event it previously sent, following a dropped connection
- **THEN** the server SHALL accept the submission without creating a second record for that event identifier

### Requirement: Durable repo-side export
The system SHALL provide a mechanism to export the full event log to a version-controlled, human-inspectable file format, independent of any device-local or hosted-database storage.

#### Scenario: Export after a sync period
- **WHEN** an export is run
- **THEN** the output SHALL contain every event currently recorded in the hosted store, in a durable file format suitable for version control
