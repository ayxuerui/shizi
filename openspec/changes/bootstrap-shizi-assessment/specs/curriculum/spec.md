## Purpose

Determines which character a learner should encounter next, given that scoring-based selection cannot bootstrap from an empty or near-empty known-set and that visually confusable characters must not be introduced close together in time.

## ADDED Requirements

### Requirement: Fixed Phase A sequence precedes scoring
The system SHALL define a fixed, hand-authored sequence of the first 25 productive characters (comprising a minimal grammatical skeleton and a small set of concrete pictographs), independent of any per-learner data. The curriculum sequencer SHALL draw from this fixed sequence until it is exhausted, before any scoring-based selection is used.

#### Scenario: Early sequencing uses the fixed list
- **WHEN** a learner's known productive-set size is smaller than the length of the Phase A sequence
- **THEN** the next character offered SHALL come from the fixed Phase A sequence, skipping any characters already known

#### Scenario: Phase A already known via assessment
- **WHEN** the assessment capability discovers that a learner already knows some Phase A characters
- **THEN** the curriculum SHALL skip those and offer the next not-yet-known character from the fixed sequence

### Requirement: Scoring-based selection after Phase A
Once Phase A is exhausted, the system SHALL select the next character to introduce using a scoring function over not-yet-known candidate-pool characters, combining: potential words unlocked, potential story content unlocked, personal relevance, a learnability estimate, and a confusability penalty against recently introduced characters. The relative weight of each factor SHALL be configurable rather than hard-coded.

#### Scenario: Selection favors high word-unlock potential
- **WHEN** two not-yet-known characters are otherwise comparable and one would complete significantly more known-vocabulary words than the other
- **THEN** the scoring function SHALL rank the higher word-unlock character above the other, all else equal

#### Scenario: Selection is reproducible
- **WHEN** the scoring function is run twice against the same learner state, candidate pool, and configured weights
- **THEN** it SHALL produce the same ranked selection both times

### Requirement: Confusability spacing is a hard constraint
The system SHALL NOT select a character as a new target if it is confusable (per the character-data confusability relationship) with a character the learner learned within a configured recent window, regardless of that character's score.

#### Scenario: Confusable candidate is skipped
- **WHEN** the highest-scoring not-yet-known candidate is confusable with a character introduced within the recent window
- **THEN** the system SHALL skip that candidate and select the next-highest-scoring, non-confusable candidate instead

#### Scenario: No non-confusable candidate available
- **WHEN** every remaining not-yet-known candidate is confusable with a recently introduced character
- **THEN** the system SHALL decline to select a new target rather than violate the spacing constraint
