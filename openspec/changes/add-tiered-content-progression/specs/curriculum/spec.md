## ADDED Requirements

### Requirement: Selection spans all three tiers
Once a learner has eligible content above the character tier, the curriculum sequencer SHALL select the next unit from across all eligible tiers — characters, words, and sentences — rather than exhausting one tier before considering the next. The relative emphasis between tiers SHALL be configurable rather than hard-coded.

#### Scenario: Eligible word competes with a candidate character
- **WHEN** a learner has both not-yet-known candidate characters and at least one eligible not-yet-known word
- **THEN** the sequencer SHALL consider units of both tiers in the same selection, rather than deferring all words until the character pool is exhausted

#### Scenario: No eligible content above the character tier
- **WHEN** a learner knows too few characters for any word to be eligible
- **THEN** the sequencer SHALL select from the character tier alone, without reporting an error

#### Scenario: Selected unit identifies its tier
- **WHEN** the sequencer returns a selected unit
- **THEN** the result SHALL identify which tier the unit belongs to, so the presenting activity can choose a tier-appropriate treatment

### Requirement: Consolidation before advancement
The sequencer SHALL NOT advance a learner to a higher tier while her mastery at the tier below is too thin to support it. The system SHALL require a configured minimum of eligible units at a tier before that tier is drawn from, so that a single newly-eligible word does not divert the sequence away from character learning.

#### Scenario: Single eligible word does not trigger tier advancement
- **WHEN** exactly one word becomes eligible and the configured minimum is greater than one
- **THEN** the sequencer SHALL continue selecting from the character tier until the minimum is met

#### Scenario: Threshold met opens the tier
- **WHEN** the number of eligible units at a tier reaches the configured minimum
- **THEN** that tier SHALL become available for selection

## MODIFIED Requirements

### Requirement: Scoring-based selection after Phase A
Once Phase A is exhausted, the system SHALL select the next unit to introduce using a scoring function over not-yet-known eligible units, combining: potential words unlocked, potential story content unlocked, personal relevance, a learnability estimate, and a confusability penalty against recently introduced units. The relative weight of each factor SHALL be configurable rather than hard-coded. The word-unlock and story-unlock factors SHALL be computed from the actual word and sentence pools — a character's word-unlock contribution SHALL reflect how many currently-ineligible words that character would make eligible — and SHALL NOT return a constant.

#### Scenario: Selection favors high word-unlock potential
- **WHEN** two not-yet-known characters are otherwise comparable and one would complete significantly more known-vocabulary words than the other
- **THEN** the scoring function SHALL rank the higher word-unlock character above the other, all else equal

#### Scenario: Word-unlock reflects real pool data
- **WHEN** a character is the last unknown component of several pool words
- **THEN** its word-unlock contribution SHALL be greater than that of a character that unlocks no words

#### Scenario: Selection is reproducible
- **WHEN** the scoring function is run twice against the same learner state, candidate pool, and configured weights
- **THEN** it SHALL produce the same ranked selection both times

### Requirement: Confusability spacing is a hard constraint
The system SHALL NOT select a unit as a new target if it is confusable with a unit of the same tier that the learner learned within a configured recent window, regardless of that unit's score. Confusability SHALL be evaluated using the measure defined for that unit's own tier — visual stroke-shape similarity for characters, and the word-tier measure for words — and SHALL NOT compare units across tiers.

#### Scenario: Confusable candidate is skipped
- **WHEN** the highest-scoring not-yet-known candidate is confusable with a unit of the same tier introduced within the recent window
- **THEN** the system SHALL skip that candidate and select the next-highest-scoring, non-confusable candidate instead

#### Scenario: No non-confusable candidate available
- **WHEN** every remaining not-yet-known candidate is confusable with a recently introduced unit of its tier
- **THEN** the system SHALL decline to select a new target rather than violate the spacing constraint

#### Scenario: Spacing does not compare across tiers
- **WHEN** a candidate word shares a character with a recently introduced character
- **THEN** the character-tier confusability measure SHALL NOT be applied to block that word, since spacing is evaluated within a tier
