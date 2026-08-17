## Purpose

Provides a curated, tagged pool of candidate characters and their linguistic and visual metadata, so that sequencing, validation, distractor selection, and future content authoring all read from one consistent, learner-appropriate dataset rather than an unbounded or unvetted character set.

## ADDED Requirements

### Requirement: Bounded candidate pool
The system SHALL maintain a candidate character pool sized for a preschool-age learner (approximately 200 characters), not a general-purpose frequency list. Any process that adds a character to the pool SHALL require an explicit, reviewable action; the pool SHALL NOT grow automatically from external corpora without review.

#### Scenario: Pool size stays bounded
- **WHEN** the candidate pool is inspected at any point during this change
- **THEN** its size SHALL remain within the preschool-appropriate bound agreed for the project, not the full frequency range of a general adult corpus

### Requirement: Identity set is distinct from the productive set
The system SHALL classify each character in the learner's personal name and household nickname as belonging to a non-productive **identity set**, distinct from the **productive set** used for sequencing and generation. Identity-set characters SHALL be permitted to appear in any text regardless of the learner's current known-set, and SHALL NOT be selected by the curriculum sequencer as new productive targets.

#### Scenario: Identity character used freely
- **WHEN** text is validated against a learner's known set
- **THEN** any character in that learner's identity set SHALL be treated as always-permitted, independent of whether it is in the productive known-set

#### Scenario: Identity character not proposed as a new target
- **WHEN** the curriculum sequencer selects the next character to introduce
- **THEN** it SHALL NOT select a character that is already in the learner's identity set

### Requirement: Per-character attributes
Every character in the candidate pool SHALL have recorded: a frequency rank or score, a concreteness/imageability tag, a pictographic-origin flag, stroke count, and ordered stroke-path data suitable for animation and tracing. These attributes SHALL be reviewable and correctable by a human rather than derived solely from an opaque automated process.

#### Scenario: Missing attribute blocks use
- **WHEN** a character in the candidate pool lacks one of the required attributes
- **THEN** the system SHALL exclude that character from curriculum selection and from distractor selection until the attribute is supplied

#### Scenario: Human-supplied concreteness tag
- **WHEN** no open dataset provides a concreteness/imageability rating for a candidate character
- **THEN** the system SHALL accept a manually supplied tag as authoritative for that character

### Requirement: Confusability relationships
The system SHALL compute or record, for each character, a set of visually or structurally confusable characters within the candidate pool (e.g., sharing most strokes, differing by one component, or near-mirror forms). This relationship SHALL be usable both to select meaningful distractors and to prevent confusable characters from being scheduled too close together.

#### Scenario: Confusable pair identified
- **WHEN** two characters in the pool differ by a small number of strokes or components in a way that commonly causes visual confusion
- **THEN** the system SHALL record them as a confusable pair, queryable by either character

#### Scenario: Confusability used for meaningful distractors
- **WHEN** a component selects distractors for a target character
- **THEN** it SHALL be able to retrieve that character's confusable set to prefer visually meaningful (rather than arbitrary) distractors

### Requirement: Data provenance and licensing
Every external dataset or font incorporated into the candidate pool (stroke-path data, frequency data, glyph/font data) SHALL have its license verified and recorded before being used in any shipped artifact.

#### Scenario: Unverified source blocks release
- **WHEN** an external dataset's license has not been verified
- **THEN** that dataset SHALL NOT be included in any build intended for use with the learner
