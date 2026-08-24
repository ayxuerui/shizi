## Purpose

Delivers a review bout: how already-due units are presented to the learner as an activity, bounded
and paced. Deliberately owns *delivery only* — which units are due, and in what order, belongs
entirely to the `review-scheduling` capability, so there is exactly one definition of due-ness in the
system.

## ADDED Requirements

### Requirement: A review bout consumes a supplied due queue
A review bout SHALL be built from a due queue supplied to it, in the order that queue provides. This
capability SHALL NOT determine which units are due, SHALL NOT compute predicted retention or review
intervals, and SHALL NOT reorder the queue it is given. When the supplied queue is empty, no review
bout SHALL be offered at all, rather than an empty bout being presented.

#### Scenario: Bout is built from the supplied queue
- **WHEN** a review bout is prepared with a non-empty due queue
- **THEN** it SHALL present units from the front of that queue, preserving the queue's order

#### Scenario: Due-ness is not redefined
- **WHEN** a review bout needs to know whether a unit is due
- **THEN** it SHALL rely on the unit's presence in the supplied queue, and SHALL NOT apply any
  recency, retention, or interval rule of its own

#### Scenario: Empty queue offers no bout
- **WHEN** the supplied due queue is empty
- **THEN** no review bout SHALL be offered, and no empty or placeholder bout SHALL be presented

### Requirement: A review bout is bounded
A review bout SHALL present at most a configured number of units. Units that remain in the supplied
queue beyond that bound SHALL be left in the queue rather than discarded, so they remain available to
a later bout.

#### Scenario: Queue is longer than the bout's bound
- **WHEN** the supplied due queue contains more units than the configured bout size
- **THEN** the bout SHALL present exactly the configured number, taken from the front of the queue
- **AND** the remaining units SHALL still be available for a later bout

#### Scenario: Queue is shorter than the bout's bound
- **WHEN** the supplied due queue contains fewer units than the configured bout size
- **THEN** the bout SHALL present every unit in the queue and end normally

### Requirement: At most one review bout per day
The system SHALL NOT begin a second review bout on the same local calendar day as a completed one,
so that review is a recurring daily beat rather than something that repeats within a single sitting.
A new local calendar day SHALL make review available again. The date used SHALL be supplied to this
capability rather than read from the clock implicitly.

#### Scenario: A review bout already ran today
- **WHEN** a review bout has already been completed on the supplied local calendar day
- **THEN** no further review bout SHALL be offered for that day, even while units remain due

#### Scenario: A new day begins
- **WHEN** the supplied local calendar day differs from the day of the last completed review bout,
  and units are due
- **THEN** a review bout SHALL be offered again

### Requirement: Review responses are recognition evidence
A response to a review item SHALL be recorded as recognition evidence, contributing to the
progression layer's mastery projection on the same terms as a measurement activity's response — so a
missed review demotes a previously-mastered unit, and a fast correct review sustains it. It SHALL be
recorded through the progression layer's own event history, not as a review-specific parallel record.

#### Scenario: A review item is missed
- **WHEN** a learner responds incorrectly to a review item for a previously-mastered unit
- **THEN** that unit's reported mastery state SHALL reflect the miss, no longer presenting as
  securely mastered

#### Scenario: A review item is answered correctly and quickly
- **WHEN** a learner responds correctly to a review item within the configured response-latency
  threshold
- **THEN** that response SHALL count as evidence sustaining the unit's mastered state

#### Scenario: Review evidence is not a separate record
- **WHEN** a review response is recorded
- **THEN** it SHALL be recorded through the progression layer's event history, indistinguishable in
  kind from a measurement response for the same unit

### Requirement: Nothing marks a bout as review to the learner
A review bout SHALL NOT be labelled, styled, or narrated to the learner as review, remediation, or
repetition, and SHALL NOT surface any scheduling artifact — no count of items due, no overdue or
lapsed indicator, no streak, and no retention score. An individual review item SHALL be presented
indistinguishably from the same item presented in any other activity.

#### Scenario: A review item's presentation
- **WHEN** a unit drawn from the due queue is presented in a review bout
- **THEN** its presentation SHALL be indistinguishable from that same unit presented outside review,
  with no distinct styling, labelling, or narration marking it as review

#### Scenario: No scheduling artifact is shown
- **WHEN** a learner is presented with any part of a review bout, including when many units are
  heavily overdue
- **THEN** the presentation SHALL contain no indication that anything is due, overdue, or being
  reviewed

### Requirement: No visible scoring or failure state
A review bout SHALL NOT display a numeric score, a pass/fail result, a count of mistakes, or any
negative visual or audio feedback for an incorrect response. An incorrect response SHALL be followed
only by a neutral or gentle redirect, and the bout SHALL continue to a positive close.

#### Scenario: Incorrect review response
- **WHEN** a learner responds incorrectly to a review item
- **THEN** the system SHALL respond with a neutral or gentle cue, with no error sound and no negative
  indicator, and SHALL continue the bout

#### Scenario: No score shown at any point in a review bout
- **WHEN** a learner completes any portion of a review bout
- **THEN** the system SHALL NOT display a running or final numeric score, percentage, or pass/fail
  summary to the learner

### Requirement: Full offline operation
A review bout SHALL be fully usable with no network connectivity, using a due queue derived from
event history already present on the device, and queuing resulting responses for later
synchronization.

#### Scenario: Review bout run with no connectivity
- **WHEN** the device has no network connection
- **THEN** the learner SHALL be able to complete a full review bout with no visible degradation, and
  the resulting responses SHALL be queued for later synchronization
