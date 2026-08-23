## ADDED Requirements

### Requirement: Characters are introduced in batches
The system SHALL group the characters it introduces into consecutive batches of a configured size,
rather than introducing them one at a time. The batch size SHALL be configurable rather than
hard-coded, and SHALL default to 5. Each batch SHALL be composed using the same per-character
selection rules that govern individual selection — the fixed Phase A sequence first, then
scoring-based selection — applied successively, treating each character already placed in the batch
as though it were known when choosing the next.

#### Scenario: Batch composed entirely from Phase A
- **WHEN** a batch is composed while the fixed Phase A sequence still has unlearned characters
- **THEN** the batch SHALL be filled from that sequence in its authored order, skipping any character
  already known

#### Scenario: Batch spans the Phase A boundary
- **WHEN** a batch is composed while fewer unlearned Phase A characters remain than the batch size
- **THEN** the batch SHALL take every remaining Phase A character in order
- **AND** SHALL fill the remainder using scoring-based selection

#### Scenario: Batch size is reconfigured
- **WHEN** the configured batch size is changed
- **THEN** subsequently composed batches SHALL contain that many characters

### Requirement: A batch contains no mutually confusable characters
No two characters within the same batch SHALL be confusable with each other, per the character-data
confusability relationship. This SHALL hold in addition to the existing constraint against
confusability with recently introduced characters.

#### Scenario: Highest-scoring candidate is confusable with an earlier pick in the same batch
- **WHEN** the highest-scoring remaining candidate is confusable with a character already placed in
  the batch being composed
- **THEN** that candidate SHALL be skipped for this batch
- **AND** the next-highest-scoring non-confusable candidate SHALL be placed instead

#### Scenario: A full batch cannot be composed without violating spacing
- **WHEN** no remaining candidate can be added to a partially composed batch without being confusable
  with one of its members or with a recently introduced character
- **THEN** the batch SHALL be left short rather than completed in violation of the constraint

### Requirement: Several upcoming batches are planned ahead
The system SHALL make a plan of several consecutive upcoming batches available, not only the
immediate next one, so that moving from one batch to the next does not require the plan to be
recomputed. The number of batches planned ahead SHALL be configurable.

#### Scenario: Plan is consumed one batch at a time
- **WHEN** a batch plan has been produced and its first batch is completed
- **THEN** the following batch SHALL already be present in that plan

#### Scenario: Plan is recomputed against newer learner state
- **WHEN** a new plan is produced after further characters have become known
- **THEN** it SHALL exclude those characters
- **AND** SHALL be composed under the same batch-size, ordering, and confusability rules

### Requirement: The curriculum does not advance batches on its own
The curriculum SHALL treat the transition from one batch to the next as an externally triggered
event, and SHALL NOT advance to a new batch on the basis of mastery, elapsed time, or any other
internally evaluated condition.

#### Scenario: Every character in the current batch becomes known
- **WHEN** all characters in the current batch have entered the learner's known set
- **THEN** the curriculum SHALL continue to treat that batch as current until it is externally
  advanced
