## Purpose

Decides which module the learner does next and reports what happened, so that decision is made in
one place against an explicit contract rather than inside the learner-facing application. Exists
because the app had become simultaneously the orchestrator, the renderer, and the place progression
logic was re-derived, which left no single answer to "how is the next module chosen?"

## ADDED Requirements

### Requirement: module selection is driven by supplied context, goals, and review queue
The learning layer SHALL obtain the learner's learner context from the progression layer, the
current batch of learning goals from the curriculum layer, and the queue of units due for review from
the review-scheduling capability, and SHALL select the next module from those inputs alone. It
SHALL NOT compute mastery, known-set membership, exposure recency, goal ordering, or review due-ness
itself, and SHALL NOT consult any record of learner history other than the supplied progress
context.

#### Scenario: Next module is selected from context and goals
- **WHEN** the learning layer is asked for the next module
- **THEN** it SHALL request a learner context from the progression layer, request a goal batch from
  the curriculum layer using that context, and return a module determined by those inputs

#### Scenario: Progression logic is not reimplemented
- **WHEN** the supplied learner context reports a unit's mastery state
- **THEN** the learning layer SHALL use that reported state rather than deriving a mastery state of
  its own from underlying history, even where the underlying history is available to it

#### Scenario: Goal ordering is not reimplemented
- **WHEN** the curriculum layer returns a batch whose goals are in a given order
- **THEN** the learning layer SHALL NOT reorder, extend, or substitute those goals

#### Scenario: Review due-ness is not reimplemented
- **WHEN** the learning layer needs to know whether any unit is due for review
- **THEN** it SHALL rely on the supplied review queue, and SHALL NOT apply any recency, retention, or
  interval rule of its own to decide due-ness or the queue's order

#### Scenario: Selection is reproducible
- **WHEN** module selection runs twice against the same learner context, goal batch, and
  configuration
- **THEN** it SHALL select the same module both times

### Requirement: Introduction precedes measurement for a goal
For any goal in the current batch that has never been presented to the learner in any module, the
learning layer SHALL select an introduction module before selecting a measurement module for that
batch. Once every goal in the batch has been presented at least once, it SHALL select a measurement
module while goals in that batch remain unmastered.

#### Scenario: Batch contains a never-presented goal
- **WHEN** the current batch contains at least one goal the learner has never been presented with
- **THEN** the learning layer SHALL select an introduction module for that goal

#### Scenario: Batch fully presented but not yet mastered
- **WHEN** every goal in the current batch has been presented at least once, and at least one is not
  yet mastered
- **THEN** the learning layer SHALL select a measurement module

#### Scenario: A presented-but-unmastered goal is not re-introduced
- **WHEN** a goal has been presented in an introduction module but has not reached a mastered state
- **THEN** the learning layer SHALL NOT select an introduction module for that goal again on the
  basis that it is unmastered

#### Scenario: Batch fully mastered
- **WHEN** every goal in the current batch has reached a mastered state
- **THEN** the learning layer SHALL advance to the next batch of goals rather than continuing to
  select modules for the completed one

### Requirement: The learner is never left without a next module
After any module reaches its end, the learning layer SHALL offer a next module without requiring
the application to be restarted or reloaded. When no goals and no review work remain, it SHALL
present a positive terminal state rather than an empty or unresponsive screen.

#### Scenario: An module completes
- **WHEN** a learner finishes a module
- **THEN** a next module SHALL become available without any restart, reload, or manual navigation

#### Scenario: Repeated modules within one sitting
- **WHEN** a learner completes several modules in succession
- **THEN** each completion SHALL be followed by a further module for as long as goals or due review
  work remain

#### Scenario: Nothing remains to do
- **WHEN** no goals remain in the curriculum's plan and no review work is due
- **THEN** the learning layer SHALL report a positive completion state, and SHALL NOT present a blank
  screen, an error, or a module with no content

### Requirement: Every module outcome is reported to the progression layer
The learning layer SHALL report the outcome of every module it delivers to the progression layer,
including outcomes that carry no recognition signal. It SHALL NOT maintain its own record of learner
history, and SHALL NOT treat a module as complete on the basis of state it holds privately.

#### Scenario: module outcome is reported
- **WHEN** a module the learning layer delivered reaches its end
- **THEN** its outcome SHALL be reported to the progression layer

#### Scenario: Non-measurement outcomes are still reported
- **WHEN** the completed module was an introduction, which carries no evidence of recognition
- **THEN** its outcome SHALL still be reported to the progression layer, distinguishable from a
  measurement outcome

#### Scenario: No parallel history is kept
- **WHEN** the learning layer needs to know what the learner has done before
- **THEN** it SHALL obtain that from the progression layer's context, and SHALL NOT read a record it
  maintains itself

### Requirement: A stale or absent published plan degrades rather than blocks
The learning layer SHALL tolerate a curriculum plan that is absent, incomplete, or computed against
an older learner context. It SHALL filter a published batch against the current learner context
before using it, and SHALL still produce a module when no published plan is available at all.

#### Scenario: Published plan is absent
- **WHEN** no published curriculum plan is available on the device
- **THEN** the learning layer SHALL still select and deliver a module

#### Scenario: Published batch contains already-mastered goals
- **WHEN** a published batch includes a goal the current learner context reports as already mastered
- **THEN** that goal SHALL be excluded from the batch the learner works on

#### Scenario: A plan is republished mid-batch
- **WHEN** a newer curriculum plan becomes available while the learner is partway through a batch
- **THEN** the goals of the batch already in progress SHALL NOT be substituted or reordered

### Requirement: Full offline operation
The learning layer SHALL select, deliver, and report modules with no network connectivity, using
only the learner context and curriculum plan already available on the device.

#### Scenario: module selection with no connectivity
- **WHEN** the device has no network connection
- **THEN** the learner SHALL be able to complete a full sequence of modules with no visible
  degradation, and every outcome SHALL be reported to the progression layer for later synchronization
