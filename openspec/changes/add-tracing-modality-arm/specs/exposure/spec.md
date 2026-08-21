## Purpose

Introduces a not-yet-known character to the learner through an arm-assigned teaching modality, so the
matched-pair randomization the adaptivity-instrumentation capability performs has something real to
route between and Loop 3 can eventually compare modality effectiveness.

## ADDED Requirements

### Requirement: Character selection defers to curriculum
Exposure SHALL select which not-yet-known character to introduce using the existing curriculum
capability's sequencing (the fixed Phase A sequence, then scoring-based selection, subject to the
confusability spacing constraint). Exposure SHALL NOT define its own character ordering.

#### Scenario: Exposure follows the curriculum sequence
- **WHEN** exposure selects the next character to introduce
- **THEN** it SHALL be the character the curriculum capability's sequencer would select next for that
  learner, not a character chosen by any exposure-specific ordering

### Requirement: Arm-bound exposure delivery
Exposure SHALL deliver the teaching modality recorded in the selected character's arm assignment. If no
assignment exists yet for that character, exposure SHALL create and record one (per the
adaptivity-instrumentation capability's matched-pair randomization protocol) before delivering the
modality it resolves to.

#### Scenario: Existing assignment is honored
- **WHEN** a character selected for introduction already has a recorded arm assignment
- **THEN** exposure SHALL deliver the modality that assignment specifies, not a different one

#### Scenario: Missing assignment is created before delivery
- **WHEN** a character selected for introduction has no recorded arm assignment
- **THEN** exposure SHALL assign and record an arm for it before presenting any modality-specific content
  to the learner

### Requirement: Guided tracing only
The tracing exposure modality SHALL keep a visible stroke-order template in place for the full duration
of the interaction and SHALL NOT require the learner to reproduce a character from unassisted memory.
Unguided handwriting production remains out of scope for this capability.

#### Scenario: Template stays visible throughout
- **WHEN** a learner is using the tracing modality to be introduced to a character
- **THEN** the stroke-order template SHALL remain visible for every stroke of the interaction

#### Scenario: Completion does not depend on unassisted recall
- **WHEN** a tracing exposure interaction completes
- **THEN** completion SHALL be reachable purely by following the visible template, with no step that
  requires the learner to produce the character without it

### Requirement: No grading or failure state
Exposure SHALL NOT display a numeric score, a correctness marking, an error sound, or any negative
visual/audio feedback for a missed stroke or an incorrect tap. Exposure SHALL always reach a positive
completion regardless of how the interaction went.

#### Scenario: Missed stroke produces no negative feedback
- **WHEN** a learner's stroke deviates from the template during tracing exposure
- **THEN** the system SHALL respond with no error sound, no red indicator, and no score change, and
  SHALL allow the interaction to continue

#### Scenario: Exposure always completes
- **WHEN** a learner works through an exposure interaction to its end
- **THEN** the system SHALL present a positive completion regardless of tracing accuracy or tap
  correctness during the interaction

### Requirement: Exposure events are non-recognition
Every exposure interaction SHALL be logged as an event (per the learner-state capability's event
schema) carrying the delivered arm's modality identifier. That modality identifier SHALL NOT be a member
of the recognition-modality set the learner-state capability's mastery projection reads from.

#### Scenario: Exposure event logged with its modality
- **WHEN** a learner completes an exposure interaction
- **THEN** the system SHALL log one event whose modality field identifies the arm actually delivered
  (e.g. a tracing-exposure or listen-exposure identifier)

#### Scenario: Exposure outcome does not promote mastery state
- **WHEN** an exposure event is logged, regardless of how the interaction went
- **THEN** it SHALL NOT contribute toward the two-consecutive-correct condition the learner-state
  capability uses to transition a character to `known`

### Requirement: Full offline operation
Exposure SHALL be fully usable with no network connectivity, including any modality-specific audio or
stroke-template assets already delivered to the device, queuing resulting events for later sync per the
learner-state capability.

#### Scenario: Exposure run with no connectivity
- **WHEN** the device has no network connection
- **THEN** the learner SHALL be able to complete a full exposure interaction with no visible degradation,
  and the resulting event SHALL be queued for later sync
