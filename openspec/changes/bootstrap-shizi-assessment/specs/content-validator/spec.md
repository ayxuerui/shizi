## Purpose

Mechanically verifies that any character-based text is safe and pedagogically appropriate for a specific learner's current state before it can reach her, so that no future authoring tool can accidentally present unreadable or poorly-paced content.

## ADDED Requirements

### Requirement: Whitelist enforcement
The system SHALL reject any text containing a character that is not in the target learner's identity set, known productive-set, or an explicitly declared set of new targets for that text. This check SHALL be a hard failure that blocks the text from being marked valid.

#### Scenario: Text uses only permitted characters
- **WHEN** every character in a submitted text belongs to the learner's identity set, known set, or declared new-target set
- **THEN** the whitelist check SHALL pass

#### Scenario: Text contains an unauthorized character
- **WHEN** a submitted text contains at least one character outside the learner's identity set, known set, and declared new-target set
- **THEN** the validator SHALL report a hard failure identifying every offending character and its location

### Requirement: New-target repetition threshold
For each character declared as a new target for a given text, the system SHALL require that character to appear at least a configured minimum number of times (default: 8) within that text. Text failing this threshold SHALL be a hard failure.

#### Scenario: New target meets repetition threshold
- **WHEN** a declared new-target character appears at least the configured minimum number of times in the text
- **THEN** the repetition check for that character SHALL pass

#### Scenario: New target under-repeated
- **WHEN** a declared new-target character appears fewer times than the configured minimum
- **THEN** the validator SHALL report a hard failure naming that character and its actual count

### Requirement: New-character density limit
The system SHALL reject text in which new-target characters make up more than a configured maximum proportion (default: 5%) of total characters in the text.

#### Scenario: Density within bounds
- **WHEN** new-target character occurrences are at or below the configured maximum proportion of total characters
- **THEN** the density check SHALL pass

#### Scenario: Too many new characters at once
- **WHEN** new-target character occurrences exceed the configured maximum proportion of total characters
- **THEN** the validator SHALL report a hard failure stating the actual and allowed proportions

### Requirement: Shaky-character seeding advisory
The system SHALL check whether a text includes at least one character currently in the learner's `shaky` mastery state, at a configured target density (default: approximately 1 per 40 characters). This check SHALL produce a warning, not a hard failure, when absent or off-target.

#### Scenario: No shaky characters present
- **WHEN** a text contains no characters from the learner's `shaky` set
- **THEN** the validator SHALL emit a warning recommending inclusion, without blocking the text

### Requirement: Confusable-adjacency advisory
The system SHALL check whether two characters known to be confusable (per character-data) appear immediately adjacent to each other in the text. This check SHALL produce a warning, not a hard failure.

#### Scenario: Confusable pair adjacent
- **WHEN** two characters recorded as a confusable pair appear next to each other in the text
- **THEN** the validator SHALL emit a warning identifying the pair and its location, without blocking the text

### Requirement: Structured validation result
The validator SHALL return a single structured result per validation run, distinguishing hard failures from warnings, and identifying the specific rule and location for each finding, so that a caller can programmatically decide whether text may be used.

#### Scenario: Result distinguishes failure severity
- **WHEN** a text triggers both a hard failure and a warning
- **THEN** the result SHALL clearly mark the text as invalid overall while still listing the warning separately

#### Scenario: Clean text passes with no findings
- **WHEN** a text triggers no hard failures and no warnings
- **THEN** the result SHALL mark the text as valid with an empty findings list
