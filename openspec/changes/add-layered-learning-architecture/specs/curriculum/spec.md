## ADDED Requirements

### Requirement: Context-driven batch output
The curriculum capability SHALL accept a learner's learner context and return a batch of learning
goals as its outward-facing contract, rather than requiring a consumer to drive single-unit selection
repeatedly and accumulate the results itself. Batch size SHALL be configurable. The confusability
spacing constraint SHALL hold across the members of a single returned batch, not only against
previously-introduced units.

#### Scenario: Requesting the next batch
- **WHEN** a consumer supplies a learner context and requests the next batch of goals
- **THEN** the capability SHALL return a batch of not-yet-known goals selected by the existing
  sequencing rules, in the order they are intended to be taught

#### Scenario: No two goals within one batch are confusable
- **WHEN** a batch of more than one goal is returned
- **THEN** no two goals within that batch SHALL be confusable with each other

#### Scenario: A batch cannot be filled without violating spacing
- **WHEN** fewer eligible goals remain than the configured batch size
- **THEN** the capability SHALL return a shorter batch, reporting why it is short, rather than
  including a goal that violates the spacing constraint

#### Scenario: Batch composition is reproducible
- **WHEN** a batch is requested twice against the same learner context, candidate pool, and
  configuration
- **THEN** the same batch SHALL be returned both times

### Requirement: Goals are identified by kind, not assumed to be single characters
Each learning goal a batch returns SHALL identify its subject by both a kind and an identity, so a
consumer can route a goal to the right module without assuming every goal is a single character.
Consumers SHALL NOT be required to enumerate the set of possible kinds in order to carry a goal
through to a module.

#### Scenario: A character-tier goal
- **WHEN** a batch containing a character-tier goal is returned
- **THEN** each goal SHALL carry a kind identifying it as a character alongside its identity

#### Scenario: A goal of an unfamiliar kind is carried, not rejected
- **WHEN** a consumer receives a goal whose kind it has no specific handling for
- **THEN** the goal's kind and identity SHALL remain intact and inspectable, so the consumer can
  report the goal as unhandled rather than misinterpreting it as a character

### Requirement: The batch plan is pre-generated, reviewable, and published
The sequence of upcoming batches SHALL be composed ahead of the session that consumes it and
published as a durable artifact, rather than computed on demand during a learner's session. The
published plan SHALL be inspectable by a person before a learner encounters it.

#### Scenario: A plan is published ahead of a session
- **WHEN** the publishing step runs against a learner's current progress
- **THEN** it SHALL produce a plan of upcoming batches as a durable artifact that a consumer can read
  without recomputing it

#### Scenario: The plan is reviewable before use
- **WHEN** a person inspects a published plan
- **THEN** the goals of each upcoming batch, in order, SHALL be readable from the artifact itself

#### Scenario: Publishing is reproducible
- **WHEN** the publishing step runs twice against the same progress and configuration
- **THEN** it SHALL produce the same plan both times

### Requirement: Several batches are published ahead
The published plan SHALL contain a configurable number of consecutive batches beyond the one
currently in progress, composed as though each preceding batch had been completed, so that advancing
to the next batch requires no connectivity and no republication.

#### Scenario: Advancing to the next batch offline
- **WHEN** a learner completes the batch in progress with no network connection available
- **THEN** the next batch SHALL be available from the already-published plan

#### Scenario: Later batches exclude earlier batches' goals
- **WHEN** a plan of several consecutive batches is published
- **THEN** no goal SHALL appear in more than one batch of that plan
