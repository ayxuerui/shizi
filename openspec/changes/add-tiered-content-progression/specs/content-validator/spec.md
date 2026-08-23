## ADDED Requirements

### Requirement: Word-level whitelist enforcement
For text intended for the word or sentence tier, the system SHALL additionally reject any word that is not in the learner's known word set or an explicitly declared set of new word targets for that text. Character-level validation passing SHALL NOT be sufficient to admit such text.

#### Scenario: Text with known characters but an undeclared word
- **WHEN** a submitted sentence uses only permitted characters but contains a word outside the learner's known word set and declared new word targets
- **THEN** the validator SHALL report a hard failure identifying that word

#### Scenario: Word-tier text with all words permitted
- **WHEN** every word in a submitted sentence belongs to the learner's known word set or declared new word targets
- **THEN** the word-level whitelist check SHALL pass

#### Scenario: Unsegmentable span
- **WHEN** a submitted sentence contains a span that cannot be covered by any pool word
- **THEN** the validator SHALL report a hard failure rather than silently skipping that span

### Requirement: Validation target tier is explicit
Every validation request SHALL declare which tier the text is intended for, and the validator SHALL apply the checks appropriate to that tier. The validator SHALL NOT infer the intended tier from the text's length or shape.

#### Scenario: Tier declared and checks applied
- **WHEN** a validation request declares the sentence tier
- **THEN** both character-level and word-level checks SHALL be applied

#### Scenario: Tier omitted
- **WHEN** a validation request omits the intended tier
- **THEN** the validator SHALL reject the request rather than guess

## MODIFIED Requirements

### Requirement: Whitelist enforcement
The system SHALL reject any text containing a character that is not in the target learner's identity set, known productive-set, or an explicitly declared set of new targets for that text. This check SHALL be a hard failure that blocks the text from being marked valid. This character-level check SHALL apply to text at every tier, and for text above the character tier it SHALL be applied in addition to the word-level whitelist rather than in place of it.

#### Scenario: Text uses only permitted characters
- **WHEN** every character in a submitted text belongs to the learner's identity set, known set, or declared new-target set
- **THEN** the whitelist check SHALL pass

#### Scenario: Text contains an unauthorized character
- **WHEN** a submitted text contains at least one character outside the learner's identity set, known set, and declared new-target set
- **THEN** the validator SHALL report a hard failure identifying every offending character and its location

#### Scenario: Character check applies to sentence-tier text
- **WHEN** a sentence-tier text contains a character outside the permitted sets
- **THEN** the validator SHALL report a hard failure, even if every word in the text is permitted
