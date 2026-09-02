## ADDED Requirements

### Requirement: Batch composition with a configurable default size
The system SHALL compose new-character targets as batches: an ordered group of not-yet-known characters produced in one composition pass, whose size SHALL default to six (6) and SHALL be configurable. A batch SHALL contain only characters eligible under the existing selection rules, drawn in ranked order.

#### Scenario: Default batch size is six
- **WHEN** a batch is composed with default configuration
- **THEN** it SHALL contain six characters (fewer only when eligibility runs out)

#### Scenario: Pool exhaustion yields a short batch
- **WHEN** fewer than the configured number of eligible characters remain
- **THEN** the composer SHALL return a short batch containing all remaining eligible characters rather than padding with ineligible ones

### Requirement: Intra-batch non-confusability is an explicit constraint
The system SHALL NOT place two mutually confusable characters (per the character-data confusability relationship) in the same batch, regardless of their position relative to the recent-window boundary. This constraint SHALL hold independently of the recent-window size, so batch size is not coupled to the window. On exhaustion of non-confusable candidates, the composer SHALL produce a short batch rather than violate the constraint.

#### Scenario: Candidate confusable with a picked batch member is skipped
- **WHEN** the highest-ranked remaining candidate is confusable with any character already selected into the current batch, even though it lies outside the recent window
- **THEN** the composer SHALL skip it and consider the next-ranked candidate instead

#### Scenario: Constraint holds when batch size exceeds the recent window
- **WHEN** the configured batch size is greater than the recent-window size minus one
- **THEN** the composed batch SHALL still contain no mutually confusable pair
