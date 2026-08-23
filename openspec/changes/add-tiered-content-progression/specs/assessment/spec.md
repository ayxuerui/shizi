## ADDED Requirements

### Requirement: Tier-appropriate distractor selection
When probing a unit above the character tier, the system SHALL draw distractors from the same tier as the probed unit, using that tier's own confusability measure. It SHALL NOT present single-character distractors against a word or sentence probe, since an obviously shorter option is discriminable without reading it.

#### Scenario: Word probe uses word distractors
- **WHEN** the system probes a word
- **THEN** every distractor offered SHALL itself be a word, selected using the word-tier confusability measure

#### Scenario: Distractors are not discriminable by shape alone
- **WHEN** distractors are chosen for a probe
- **THEN** they SHALL be comparable in length to the probed unit, so the correct answer is not identifiable without reading

#### Scenario: Insufficient same-tier distractors
- **WHEN** too few same-tier distractors are available for a probe
- **THEN** the system SHALL decline to probe that unit rather than substitute distractors from another tier

### Requirement: Probing respects tier eligibility
The assessment SHALL only probe units the learner is eligible for at that tier, so she is never asked to read a word containing a character she has not been shown. Ineligible units SHALL NOT be probed even when they would be informative about the frontier.

#### Scenario: Ineligible word not probed
- **WHEN** a word contains a character outside the learner's known set
- **THEN** the assessment SHALL NOT probe that word

#### Scenario: Newly eligible word becomes probeable
- **WHEN** a word's last unknown component character enters the learner's known set
- **THEN** that word SHALL become available as a probe candidate

## MODIFIED Requirements

### Requirement: Adaptive frontier-search probing
The assessment SHALL select which unit to probe next using an adaptive strategy that locates the boundary between units the learner knows and does not know, rather than probing the full candidate pool exhaustively or in a fixed order. It SHALL prioritize probes expected to be most informative about that boundary, while narrowing toward a dense sweep once an approximate boundary is found. A separate frontier SHALL be maintained per tier, using a difficulty measure appropriate to that tier, since a unit's difficulty above the character tier depends on its components rather than on stroke count and character frequency.

#### Scenario: Coarse probing before narrowing
- **WHEN** an assessment session begins with no prior knowledge of the learner's frontier
- **THEN** the system SHALL probe units spanning a wide difficulty range before concentrating probes in a narrower band

#### Scenario: Narrowing around the discovered frontier
- **WHEN** the system has identified an approximate boundary between known and unknown units
- **THEN** subsequent probes in that session SHALL concentrate on units near that boundary rather than continuing to sample broadly

#### Scenario: Identity and previously-flagged characters are probed too
- **WHEN** a session runs
- **THEN** the system SHALL include the learner's identity-set characters and any `shaky`-state units as probe candidates alongside frontier-search candidates, since these can violate a purely difficulty-ordered assumption

#### Scenario: Frontiers are maintained separately per tier
- **WHEN** a session probes both characters and words
- **THEN** the discovered boundary for one tier SHALL NOT be treated as the boundary for another, and each tier's probes SHALL be positioned against its own difficulty measure
