## Purpose

Estimates how well the learner still remembers each thing she has learned, given how long it has been
since she last saw it, and turns that estimate into an ordered queue of what is due — so that review
happens because memory is fading rather than because an item happened to be drawn again.

## ADDED Requirements

### Requirement: Predicted retention decays with elapsed time
The system SHALL maintain, for every unit the learner has been exposed to, a predicted-retention
estimate that decreases monotonically as time passes since that unit's last exposure. A unit SHALL
become due for review once its predicted retention falls to or below a configured target-retention
threshold, and that transition SHALL occur through the passage of time alone, with no new event
recorded and no other state changing.

#### Scenario: A unit becomes due without any new interaction
- **WHEN** enough time passes since a unit's last exposure that its predicted retention reaches the
  configured target-retention threshold
- **THEN** that unit SHALL be reported as due for review, even though no event has been recorded for
  it since that last exposure

#### Scenario: Retention never increases while unseen
- **WHEN** predicted retention for the same unit is queried at two times, with no intervening event
  for that unit
- **THEN** the estimate at the later time SHALL NOT be higher than the estimate at the earlier time

#### Scenario: A unit never seen has no retention estimate
- **WHEN** predicted retention is queried for a unit the learner has never been exposed to
- **THEN** the system SHALL report it as having no retention estimate rather than a decayed one, and
  SHALL NOT place it in the review queue

### Requirement: Response quality sets the next review interval
Each recorded response SHALL update the unit's review interval according to the same
correct/latency semantics the system already uses to detect guessing: a correct response faster than
the configured threshold SHALL lengthen the interval; an incorrect response SHALL shorten it toward
the configured minimum; a correct response slower than the threshold SHALL leave the interval
unchanged, being neither evidence of secure recall nor evidence of a lapse. Intervals SHALL be
bounded by a configured minimum and maximum so that neither a run of successes nor a run of lapses
can drive scheduling to a degenerate extreme.

#### Scenario: Fast correct response pushes review further out
- **WHEN** a unit receives a correct response with latency below the configured threshold
- **THEN** its next due time SHALL be further into the future than it would have been under the
  interval in force before that response

#### Scenario: Incorrect response brings review forward
- **WHEN** a unit receives an incorrect response
- **THEN** its interval SHALL be reduced toward the configured minimum and it SHALL become due again
  substantially sooner than before that response

#### Scenario: Slow correct response leaves the interval alone
- **WHEN** a unit receives a correct response with latency above the configured threshold
- **THEN** its interval SHALL be unchanged — neither lengthened as a success nor collapsed as a lapse

#### Scenario: Interval stays within its configured bounds
- **WHEN** a unit accumulates a long run of consecutive fast-correct responses, or a long run of
  incorrect ones
- **THEN** its interval SHALL remain within the configured minimum and maximum

### Requirement: Scheduling parameters are configurable per tier
Every scheduling parameter — starting interval, the amount an interval lengthens on success, the
amount it shortens on a lapse, the interval bounds, the latency threshold, and the target-retention
threshold — SHALL be configurable independently for each content tier. No parameter SHALL be fixed
in a way that forces the character and word tiers to share a value.

#### Scenario: A tier's parameters are changed independently
- **WHEN** the word tier's target-retention threshold is configured to a different value from the
  character tier's
- **THEN** due decisions for word units SHALL use the word tier's value and due decisions for
  character units SHALL use the character tier's, with neither affected by the other

#### Scenario: Latency threshold differs by tier
- **WHEN** a word and a character each receive a correct response at the same latency, and that
  latency is below the word tier's configured threshold but above the character tier's
- **THEN** the word's interval SHALL lengthen and the character's SHALL be left unchanged

### Requirement: Review queue is ordered by retention risk and is reproducible
The system SHALL expose the due units as an ordered queue, most at-risk first — that is, in
ascending order of predicted retention — with a deterministic tie-break so the ordering is total.
Given the same event history, the same configuration, and the same evaluation time, the queue SHALL
be identical on every evaluation.

#### Scenario: Most-at-risk unit is offered first
- **WHEN** two units are both due and one has a lower predicted retention than the other
- **THEN** the lower-retention unit SHALL appear earlier in the queue

#### Scenario: Queue is reproducible
- **WHEN** the queue is computed twice from the same event history, configuration, and evaluation
  time
- **THEN** both computations SHALL produce the same units in the same order

#### Scenario: Units from different tiers share one queue ordering
- **WHEN** both character and word units are due at the same time
- **THEN** the queue SHALL contain both, ordered by retention risk across tiers rather than grouping
  one tier ahead of the other

### Requirement: Scheduling is a replayable projection, not stored judgement
All scheduling state SHALL be derived from the learner's event log, the configured parameters, and
the evaluation time supplied by the caller. The system SHALL NOT read the current time implicitly,
and SHALL NOT depend on any scheduling decision recorded at the time it was originally made.
Changing a parameter or the retention model itself SHALL require no re-collected data: replaying the
existing log under the new configuration SHALL produce a complete, valid schedule.

#### Scenario: Model change requires no new data
- **WHEN** the retention model or any of its parameters is changed
- **THEN** replaying the existing event log SHALL produce a complete schedule for every unit the
  learner has been exposed to, with no event needing to be re-collected

#### Scenario: Evaluation time is supplied, not read
- **WHEN** the schedule is computed twice with the same event log and the same supplied evaluation
  time, at two different real-world moments
- **THEN** both computations SHALL produce identical results

### Requirement: Due units are actively surfaced
While any unit is due, the system SHALL prefer due units over not-due ones when filling the slots an
activity reserves for already-known content. A due unit SHALL NOT be left waiting on being drawn by
chance. The share of an activity's slots that may be consumed by review SHALL be capped by
configuration, so that a large backlog of due units cannot take over a session.

#### Scenario: A due unit is offered rather than a not-due one
- **WHEN** an activity needs an already-known item and at least one unit is due
- **THEN** it SHALL be offered a due unit rather than an arbitrary not-due known unit

#### Scenario: Nothing due leaves selection unchanged
- **WHEN** an activity needs an already-known item and no unit is due
- **THEN** selection SHALL proceed exactly as it would if no scheduling existed at all

#### Scenario: Backlog cannot consume the whole session
- **WHEN** the number of due units exceeds the configured share of an activity's available slots
- **THEN** review SHALL fill only up to that configured share, and the remaining slots SHALL be
  filled as they would have been without review

### Requirement: Scheduling is invisible to the learner
The system SHALL NOT surface any scheduling artifact to the learner: no count of items due, no
overdue or lapsed indicator, no streak, no retention score, and no deadline or time-pressure cue. A
review item SHALL be presented indistinguishably from any other item of the same kind.

#### Scenario: No due-count or overdue indicator shown
- **WHEN** the learner is presented with any part of an activity while units are due, including
  heavily overdue ones
- **THEN** the presentation SHALL contain no indication that anything is due, overdue, or being
  reviewed

#### Scenario: Review item is presented like any other
- **WHEN** an item drawn from the review queue is presented
- **THEN** its presentation SHALL be indistinguishable from the same item presented outside of
  review, with no distinct styling, labelling, or narration marking it as a review
