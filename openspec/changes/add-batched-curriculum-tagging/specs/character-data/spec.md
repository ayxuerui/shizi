## ADDED Requirements

### Requirement: Human tag corrections are captured incrementally
The system SHALL accept human concreteness and pictographic-origin corrections for one character at
a time, at any point, without requiring a complete pass over the candidate pool. A character whose
tags have not been corrected SHALL retain its existing generated values and SHALL remain
distinguishable from one whose values a human has supplied.

#### Scenario: A single character is corrected
- **WHEN** a human supplies corrected tag values for one character
- **THEN** that character SHALL be recorded as human-reviewed
- **AND** every other character's values and reviewed status SHALL be unchanged

#### Scenario: Most of the pool is still uncorrected
- **WHEN** only some characters in the pool have received human corrections
- **THEN** the remainder SHALL continue to expose their generated values
- **AND** SHALL continue to be reported as not human-reviewed

### Requirement: A human tag record supplies both attributes together
A human tag record SHALL carry both the concreteness and the pictographic-origin value for its
character. Recording one attribute without the other SHALL NOT be possible, so a character can never
be left in a state where one attribute is authoritative and the other is generated.

#### Scenario: Correction confirms one value and changes the other
- **WHEN** a human accepts a character's generated concreteness value but changes its
  pictographic-origin value
- **THEN** the recorded tag SHALL carry both values
- **AND** the character SHALL be reported as human-reviewed for both

### Requirement: Tag records are append-only and resolve to the latest
Tag records SHALL be append-only: a later correction for a character SHALL be recorded as an
additional record rather than replacing or erasing an earlier one, and no operation SHALL mutate or
delete an existing record. When the effective tag values for a character are determined, the record
with the most recent timestamp SHALL win.

#### Scenario: A character is corrected twice
- **WHEN** a human records tag values for a character and later records different values for the
  same character
- **THEN** both records SHALL be retained
- **AND** the character's effective values SHALL be those of the later record

#### Scenario: An earlier record arrives after a later one
- **WHEN** tag records for a character are processed out of chronological order
- **THEN** the effective values SHALL still be those of the record with the most recent timestamp

#### Scenario: The same record is submitted more than once
- **WHEN** an identical tag record is submitted again
- **THEN** it SHALL NOT create a duplicate
- **AND** the character's effective values SHALL be unchanged

### Requirement: Captured corrections reach the durable character data
Human tag corrections SHALL be folded back into the project's durable character-data source, such
that the corrected values and the character's human-reviewed status are what downstream selection
subsequently reads. The durable source SHALL remain directly readable and correctable by hand
independently of the capture mechanism.

#### Scenario: Corrections are applied to the durable source
- **WHEN** captured corrections are folded into the durable character data
- **THEN** exactly the corrected characters SHALL become human-reviewed
- **AND** characters without corrections SHALL remain on their generated values

#### Scenario: A correction is made by hand instead
- **WHEN** a human edits the durable character-data source directly rather than through the capture
  mechanism
- **THEN** that edit SHALL be honoured with the same authority as a captured correction
