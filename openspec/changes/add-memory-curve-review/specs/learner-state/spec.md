## ADDED Requirements

### Requirement: Per-unit progress is materialized in the durable store
The system SHALL persist, in the durable store, one progress record per unit the learner has been
exposed to, keyed by the unit's kind-qualified reference so that character-tier and word-tier
progress are separately addressable. Each record SHALL carry at least: mastery state, total exposure
count, correct-response count, the time of last exposure, the unit's current review interval, and its
next due time. These records SHALL be written only as the output of the projection over the event
log; the system SHALL expose no interface for editing a progress record directly, and no component
SHALL treat a progress record as an input to the next projection.

#### Scenario: Progress is queryable per tier without replaying the log in the caller
- **WHEN** a caller asks the durable store for the learner's progress at a given tier
- **THEN** it SHALL receive one record per exposed unit of that tier, with no unit of another tier
  included, and without the caller performing its own replay

#### Scenario: Direct edit of a progress record is refused
- **WHEN** any component attempts to set a progress record's value other than by projecting the event
  log
- **THEN** the system SHALL reject the operation

#### Scenario: Progress loss is recoverable
- **WHEN** every materialized progress record is deleted or found corrupted
- **THEN** the system SHALL be able to reconstruct all of them from the event log alone, with no
  learning history lost

### Requirement: Materialized progress is version-stamped and rebuildable
The materialized progress SHALL carry a stamp identifying the version of the projection logic that
produced it. When the projection logic changes, the system SHALL be able to rebuild every progress
record from the event log, and SHALL NOT serve records produced by a superseded version as though
they were current. Incrementally updating progress as events arrive SHALL produce the same result as
a full rebuild from the same events.

#### Scenario: Incremental update matches full rebuild
- **WHEN** progress is updated incrementally as each event is recorded, and then rebuilt from scratch
  over the same event log
- **THEN** the two results SHALL be identical for every unit

#### Scenario: Superseded version is not served as current
- **WHEN** the projection logic's version differs from the version stamped on the materialized
  progress
- **THEN** the system SHALL report the materialized progress as stale rather than returning it as
  current

#### Scenario: Duplicate event does not double-count
- **WHEN** an event already recorded is submitted again, as happens on a retry or reconnect
- **THEN** the affected unit's progress record SHALL be unchanged — no exposure or correct count
  incremented a second time, and no interval advanced twice

### Requirement: Canonical export remains events-only
The durable, version-controlled export SHALL contain events only. Materialized progress SHALL NOT be
included in it, since progress is recomputable from the events and a second stored copy of derived
state would compete with the event log as the canonical record.

#### Scenario: Export contains no derived progress
- **WHEN** an export is run against a store holding both events and materialized progress
- **THEN** the output SHALL contain every event and no progress record

#### Scenario: Restoring from an export yields full progress
- **WHEN** a store is reconstructed from an export alone
- **THEN** rebuilding the projection SHALL produce progress records equivalent to those held before,
  for every unit
