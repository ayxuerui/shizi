## Purpose

Captures the event data, randomized assignments, and parent feedback required for future adaptive modeling of learning modality effectiveness, without performing any such inference itself — because at the data volumes available in the first months, premature model-fitting would learn noise rather than signal.

## ADDED Requirements

### Requirement: Full-coverage event logging
Every learner-facing activity built in this change (currently: the assessment) SHALL log its interactions using the complete event schema defined by the learner-state capability, including contextual fields not yet used by any live adaptation logic (time of day, adult-presence flag, position within session). Logging SHALL NOT be deferred until a consuming model exists.

#### Scenario: Contextual field logged before it has a consumer
- **WHEN** an activity records an interaction event
- **THEN** it SHALL populate time-of-day, adult-presence, and session-position fields even though no logic in this change yet reads them for adaptation

### Requirement: Matched-pair randomization protocol
The system SHALL support assigning a not-yet-known character to one of a configured set of "arms" (intended for future comparison of teaching modalities) using random assignment within pairs of characters matched on stroke count, concreteness, frequency, and confusability-neighborhood size. The assignment SHALL be recorded at the time it is made, independent of any outcome.

#### Scenario: Matched pair assigned to different arms
- **WHEN** two not-yet-known characters are identified as a matched pair
- **THEN** the system SHALL randomly assign each member of the pair to an arm and SHALL record both assignments, even if only one arm is currently implemented

#### Scenario: Assignment recorded before outcome is known
- **WHEN** a character is assigned to an arm
- **THEN** the assignment record SHALL be written immediately, not deferred until a learning outcome is observed

### Requirement: No inference performed in this change
The system SHALL NOT compute or surface any per-modality effectiveness estimate, retention-model output, or routing decision based on the logged data in this change. Data collection and randomization SHALL be fully separated from any future inference component.

#### Scenario: Modality comparison data collected without a comparison result
- **WHEN** matched-pair assignments and their associated events accumulate over multiple sessions
- **THEN** the system SHALL make this data available for later analysis but SHALL NOT produce any effectiveness ranking, score, or recommendation from it within this change

### Requirement: Parent one-tap session rating
At the end of each session, the system SHALL prompt the accompanying parent for a single-tap qualitative rating (e.g., loved it / fine / checked out) and SHALL record it as an event associated with that session.

#### Scenario: Parent provides a rating
- **WHEN** a session ends
- **THEN** the system SHALL present exactly one simple rating prompt and, on response, SHALL record the rating linked to that session's identifier

#### Scenario: Parent skips the rating
- **WHEN** a session ends and the parent does not respond to the rating prompt within a short grace period
- **THEN** the system SHALL proceed without blocking, recording no rating for that session
