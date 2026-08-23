## ADDED Requirements

### Requirement: Character-to-word participation is queryable
The system SHALL expose, for each character in the candidate pool, the set of word-pool words that character participates in. This data SHALL be derived from the word pool rather than hand-maintained, so it cannot drift out of step with the words actually available.

#### Scenario: Participation set available for scoring
- **WHEN** the curriculum requests the words a candidate character participates in
- **THEN** the system SHALL return every word-pool word containing that character

#### Scenario: Character participating in no words
- **WHEN** a pool character appears in no word-pool word
- **THEN** the system SHALL return an empty set rather than an error

#### Scenario: Participation data tracks the word pool
- **WHEN** the word pool changes
- **THEN** the participation data SHALL reflect the change without a separate manual update
