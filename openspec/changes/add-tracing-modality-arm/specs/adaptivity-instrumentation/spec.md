## MODIFIED Requirements

### Requirement: Matched-pair randomization protocol
The system SHALL support assigning a not-yet-known character to one of a configured set of "arms" (used
for comparison of teaching modalities) using random assignment within pairs of characters matched on
stroke count, concreteness, frequency, and confusability-neighborhood size. The configured arm set SHALL
contain at least two arms, since the randomization carries no comparison signal with only one. The
assignment SHALL be recorded at the time it is made, independent of any outcome.

#### Scenario: Matched pair assigned to different arms
- **WHEN** two not-yet-known characters are identified as a matched pair
- **THEN** the system SHALL randomly assign each member of the pair to an arm and SHALL record both
  assignments, drawing from a configured arm set of at least two arms

#### Scenario: Assignment recorded before outcome is known
- **WHEN** a character is assigned to an arm
- **THEN** the assignment record SHALL be written immediately, not deferred until a learning outcome is
  observed

## ADDED Requirements

### Requirement: Assigned arm governs delivered modality
A character's recorded arm assignment SHALL determine the teaching modality actually delivered when that
character is introduced to the learner. An assignment SHALL NOT be recorded without a corresponding
consumer that honors it.

#### Scenario: Delivered modality matches the recorded assignment
- **WHEN** a character with a recorded arm assignment is introduced to the learner
- **THEN** the modality actually presented SHALL be the one the assignment specifies, not a
  fixed or default modality
