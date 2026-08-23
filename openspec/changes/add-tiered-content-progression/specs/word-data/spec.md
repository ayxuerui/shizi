## Purpose

Supplies the 词 candidate pool — the multi-character words a learner can be offered once she knows their component characters — with the glosses, pronunciations, and component data the curriculum and assessment tiers need, sourced from a licence-cleared dictionary rather than hand-authored word by word.

## ADDED Requirements

### Requirement: Words are composed only of pool characters
Every word in the candidate pool SHALL be composed exclusively of characters present in the character candidate pool. A word containing any character outside that pool SHALL be excluded, since such a word could never become eligible.

#### Scenario: Word with an out-of-pool character is excluded
- **WHEN** a dictionary entry contains a character absent from the character candidate pool
- **THEN** that entry SHALL NOT enter the word candidate pool

#### Scenario: Every pool word is reachable
- **WHEN** the assembled word pool is audited against the character pool
- **THEN** every word SHALL be composed entirely of pool characters, so that each word is eligible under some attainable known-character set

### Requirement: Per-word attributes
Each word in the pool SHALL carry: its component characters in order, a child-appropriate meaning gloss, its pronunciation, and a frequency indicator. A word missing any required attribute SHALL be excluded from selection, in the same manner as the character tier's missing-attribute rule.

#### Scenario: Missing attribute blocks use
- **WHEN** a word lacks a required attribute
- **THEN** the system SHALL exclude it from curriculum selection and from assessment probing, and SHALL be able to report which attributes are missing

#### Scenario: Attributes available for presentation
- **WHEN** an eligible word is selected for introduction
- **THEN** its gloss and pronunciation SHALL be available to the presenting activity without an additional data lookup outside the pool

### Requirement: Age-appropriateness curation
The word pool SHALL be curated for a preschool-age learner: words whose meanings are inappropriate, abstract beyond the learner's grasp, or absent from a young child's spoken vocabulary SHALL be excluded even when their component characters are all in the pool. Exclusions SHALL be recorded rather than silently applied.

#### Scenario: Age-inappropriate word excluded despite valid composition
- **WHEN** a word is composed entirely of pool characters but its meaning is unsuitable for a preschool-age learner
- **THEN** it SHALL be excluded from the pool and the exclusion SHALL be recorded with a reason

#### Scenario: Curation decisions are reviewable
- **WHEN** the word pool is reviewed
- **THEN** every exclusion SHALL be inspectable as data, so a human can audit and revise the curation without re-deriving the pool from scratch

### Requirement: Word-level confusability
The system SHALL express confusability between words, and SHALL NOT reuse the character tier's visual stroke-shape similarity as the word-level measure. Word confusability SHALL account for shared component characters and similar pronunciation.

#### Scenario: Words sharing a component are related as confusable
- **WHEN** two words share a component character in the same position and are otherwise similar in length
- **THEN** the system SHALL be able to report them as confusable for distractor and spacing purposes

#### Scenario: Character-level confusability is not applied to words
- **WHEN** word confusability is requested
- **THEN** the result SHALL be derived from word-level criteria, and SHALL NOT be a lookup of the stroke-shape confusability of the words' individual characters

### Requirement: Word data provenance and licensing
The word pool SHALL be traceable to a licence-cleared source, and the source's attribution and share-alike obligations SHALL be discharged in the repository before the derived data is used by any shipped component.

#### Scenario: Attribution recorded before use
- **WHEN** dictionary-derived word data is first used by a shipped component
- **THEN** the repository SHALL already contain the required attribution and licence notice for that source

#### Scenario: Unverified source blocks release
- **WHEN** word data cannot be traced to a licence-cleared source
- **THEN** it SHALL NOT be included in the pool
