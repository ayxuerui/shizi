## ADDED Requirements

### Requirement: Existing character events migrate without loss
Because the event schema's item reference becomes kind-qualified, every event written under the prior character-only schema SHALL be migrated to an equivalent kind-qualified event identifying the character tier. Migration SHALL preserve every existing event and its identifier, consistent with the append-only guarantee.

#### Scenario: Prior event replayed after migration
- **WHEN** an event written under the character-only schema is replayed after migration
- **THEN** it SHALL resolve to the same character as before, now explicitly qualified to the character tier

#### Scenario: No event lost or duplicated in migration
- **WHEN** the migration is run against the existing event log
- **THEN** the resulting log SHALL contain exactly one migrated event for each original event, with identifiers preserved so that re-running the migration creates no duplicates

#### Scenario: Unqualified event rejected after migration
- **WHEN** an event is submitted without a kind after the schema change
- **THEN** the system SHALL reject it rather than assume the character tier

## MODIFIED Requirements

### Requirement: Event schema captures interaction context
Every learner-interaction event SHALL record, at minimum: a unique event identifier, timestamp, session identifier, the content unit involved as a kind-qualified reference identifying both its tier and its identity, the activity/modality that produced it, the outcome, response latency, and contextual fields (position within session, prior exposure count for that unit, days since last exposure to that unit, time of day, and whether a parent was present).

#### Scenario: Event missing a required field
- **WHEN** an event is submitted without one of the required fields
- **THEN** the system SHALL reject the event and SHALL NOT write a partial record

#### Scenario: Event recorded with full context
- **WHEN** a learner interacts with a content unit at any tier in any activity
- **THEN** the system SHALL persist one event containing all required fields listed above

#### Scenario: Same text at two tiers does not collide
- **WHEN** a learner interacts with a word and with a character whose text is identical
- **THEN** the two events SHALL be attributed to distinct units, and exposure counts for one SHALL NOT include interactions with the other

### Requirement: Known-set and mastery projection
The system SHALL derive, for every unit in every candidate pool, a mastery state of `unseen`, `probing`, `known`, or `shaky`, computed from the event log and tracked independently per tier. A unit SHALL transition to `known` only after at least two consecutive correct responses with response latency below the configured guess-detection threshold. A unit previously `known` SHALL transition to `shaky` on any incorrect response or any correct response with latency above the configured slow-response threshold. Latency thresholds SHALL be configurable per tier, since a longer unit takes longer to read without indicating weaker recognition.

#### Scenario: Two fast correct responses promote to known
- **WHEN** a unit has at least two consecutive correct responses, each with latency below the guess-detection threshold configured for its tier
- **THEN** its mastery state SHALL be `known`

#### Scenario: A single miss demotes a known character
- **WHEN** a unit in state `known` receives an incorrect response
- **THEN** its mastery state SHALL transition to `shaky`

#### Scenario: Slow correct response does not count toward known
- **WHEN** a unit receives a correct response with latency above the guess-detection threshold configured for its tier
- **THEN** that response SHALL NOT count toward the two-consecutive-correct requirement for promotion to `known`

#### Scenario: Mastery is independent across tiers
- **WHEN** a word reaches state `known`
- **THEN** the mastery states of its component characters SHALL be unchanged, and mastery of the word SHALL NOT be inferred from its components nor components inferred from it

#### Scenario: Known set is queryable per tier
- **WHEN** a caller requests the learner's known set for a given tier
- **THEN** the result SHALL contain only units of that tier
