## Purpose

The adult-facing gate that runs immediately before each learning batch begins: it presents the
characters about to be taught for tag confirmation or correction, reports how the current batch is
going, and is the only place a batch is closed and the next one opened.

## ADDED Requirements

### Requirement: A batch is preceded by a parent review
Each batch of new characters SHALL be preceded by a review presented to the adult, and a batch
SHALL NOT begin introducing its characters until that review is closed. Closing the review is a
single deliberate action and SHALL NOT require the adult to have changed anything.

#### Scenario: Review pending for the next batch
- **WHEN** the current batch has been closed and a next batch is available
- **THEN** the system SHALL present that batch's review
- **AND** it SHALL NOT introduce any character from that batch until the review is closed

#### Scenario: Adult closes the review without making a correction
- **WHEN** the adult closes a batch review having confirmed or changed nothing
- **THEN** the batch SHALL begin
- **AND** every character in it SHALL retain its existing unreviewed tag values

### Requirement: The review gate never blocks practice
The review gate SHALL restrict only the introduction of new characters. A learner SHALL be able to
run a full session practising already-introduced characters while a batch review is still pending.

#### Scenario: Session started with a review pending and no adult available
- **WHEN** a session starts while the next batch's review has not been closed
- **THEN** the session SHALL proceed using already-introduced characters
- **AND** the learner SHALL NOT be shown any blocking prompt or empty state

### Requirement: Review presents current tag values for confirmation
The review SHALL present, for every character in the upcoming batch, that character's current
concreteness and pictographic-origin values pre-filled, and SHALL indicate whether those values are
human-reviewed or machine-generated. The adult's task SHALL be to confirm or correct presented
values rather than to originate them.

#### Scenario: Character carrying generated tag values
- **WHEN** a character in the upcoming batch has never been reviewed by a human
- **THEN** the review SHALL show its generated values already selected
- **AND** SHALL mark that character as not yet human-reviewed

#### Scenario: Character already reviewed in an earlier batch
- **WHEN** a character in the upcoming batch already carries human-reviewed values
- **THEN** the review SHALL show those values as the current selection
- **AND** SHALL allow the adult to change them again

### Requirement: Tag corrections survive without connectivity
A tag correction SHALL be recorded durably on the device at the moment it is made, independent of
network availability, and SHALL be retained after it has been successfully synced. A failure to
sync SHALL NOT surface to the user and SHALL NOT discard the correction.

#### Scenario: Correction made with no connectivity
- **WHEN** the adult corrects a tag while the device is offline
- **THEN** the correction SHALL be recorded locally and the review SHALL proceed normally
- **AND** it SHALL be transmitted on a later opportunity without any further adult action

#### Scenario: Transmission fails
- **WHEN** transmitting a recorded correction fails for any reason
- **THEN** the correction SHALL remain pending for retry
- **AND** no error SHALL be shown on any screen

### Requirement: Review reports the closing batch's progress
The review SHALL report, for the batch being closed, which of its characters have reached the
learner's known set and which have not. This report SHALL be adult-facing only and SHALL NOT
introduce any score, count, or failure indication onto a learner-facing screen.

#### Scenario: Closing a batch with characters still unmastered
- **WHEN** the adult opens the review while some characters in the current batch are not yet in the
  known set
- **THEN** the review SHALL identify which characters those are
- **AND** SHALL still permit the batch to be closed

### Requirement: Only the adult advances a batch
The system SHALL NOT advance from one batch to the next on its own, whether on a mastery threshold,
an elapsed interval, or any other automatic condition. Advancing SHALL require the adult's action at
the review.

#### Scenario: Every character in the batch is mastered
- **WHEN** all characters in the current batch have reached the known set
- **THEN** the system SHALL NOT open the next batch by itself
- **AND** it SHALL wait for the adult to advance at the review

#### Scenario: A character never reaches mastery
- **WHEN** a character in the current batch has not reached the known set after any amount of
  practice
- **THEN** the adult SHALL still be able to advance to the next batch
- **AND** that character SHALL remain eligible for continued practice

### Requirement: The review is not reachable by the learner
The review SHALL NOT be reachable from any labelled control on a learner-facing screen, and reaching
it SHALL require a deliberate, non-obvious action.

#### Scenario: Learner uses the app unattended
- **WHEN** the learner interacts with any learner-facing screen
- **THEN** no visible or labelled affordance SHALL lead to the review

### Requirement: Advancing does not depend on a fresh publish
Enough upcoming batches SHALL be available on the device that closing one batch and beginning the
next requires no newly published plan and no connectivity.

#### Scenario: Adult advances while offline and no new plan has been published
- **WHEN** the adult advances at the review while the device is offline
- **THEN** the next batch's review SHALL be presented from the plan already on the device
