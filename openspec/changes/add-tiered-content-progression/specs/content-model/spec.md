## Purpose

Defines the tiered content units a learner progresses through — characters, words, and sentences — and the rule that a unit only becomes eligible once every component it is built from is already known, so the learning sequence advances at the learner's own pace rather than on a fixed syllabus.

## ADDED Requirements

### Requirement: Content units are kind-qualified
Every unit of learnable content SHALL carry an explicit kind of `character`, `word`, or `sentence`, together with an identifier that is unique within that kind. No component SHALL rely on a unit's text alone to identify it, since the same text can be a valid unit at more than one tier.

#### Scenario: Same text at two tiers is two distinct units
- **WHEN** a single-character word and the character of the same text are both present in the content set
- **THEN** the system SHALL treat them as two distinct units with distinct identities, and mastery of one SHALL NOT be read as mastery of the other

#### Scenario: Unit referenced without a kind
- **WHEN** a component attempts to reference a content unit by identifier alone, with no kind
- **THEN** the reference SHALL be rejected as ambiguous rather than resolved against a default tier

### Requirement: Tier ordering is fixed
The system SHALL define exactly one tier ordering — `character` → `word` → `sentence` — and SHALL treat it as a fixed progression. A tier's components SHALL always be units of the tier immediately below it: a word's components are characters, and a sentence's components are words.

#### Scenario: Word decomposes to characters
- **WHEN** a word unit is inspected for its components
- **THEN** the system SHALL return character units, and every character in the word's text SHALL be accounted for

#### Scenario: Sentence decomposes to words
- **WHEN** a sentence unit is inspected for its components
- **THEN** the system SHALL return word units covering the sentence's full text, so that no span of the sentence belongs to no word

### Requirement: Eligibility requires all components known
A unit above the character tier SHALL be eligible for introduction only when every one of its components is in the learner's known set for the tier below. Eligibility SHALL be computed from the learner's own event-sourced state at the time of the query, never from a precomputed or hand-maintained ordering.

#### Scenario: Word becomes eligible when its last character is learned
- **WHEN** a learner's known character set comes to include every character composing a word that was previously ineligible
- **THEN** that word SHALL become eligible for introduction without any change to the content data itself

#### Scenario: Word with an unknown component stays ineligible
- **WHEN** a word contains at least one character not in the learner's known set
- **THEN** that word SHALL be reported ineligible, and the system SHALL be able to name which components are missing

#### Scenario: Sentence gated on words, not characters
- **WHEN** a learner knows every character in a sentence but not every word composing it
- **THEN** that sentence SHALL remain ineligible, since sentence eligibility depends on the word tier rather than the character tier

### Requirement: Demotion propagates upward
When a component unit leaves the learner's known set, every unit above it that depends on that component SHALL cease to be eligible for introduction as a new target. Content already introduced SHALL NOT be retroactively withdrawn or deleted from the learner's history.

#### Scenario: Character demotion makes a word ineligible
- **WHEN** a character composing an eligible word transitions out of the known set
- **THEN** that word SHALL no longer be offered as a new target while the character remains unknown

#### Scenario: History is preserved through demotion
- **WHEN** a unit becomes ineligible because a component was demoted
- **THEN** the learner's existing events for that unit SHALL remain intact and its own mastery state SHALL remain computable
