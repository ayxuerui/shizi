## MODIFIED Requirements

### Requirement: Known-set and mastery projection
The system SHALL derive, for every character in the candidate pool, a mastery state of `unseen`,
`probing`, `known`, or `shaky`, computed from the event log. Only events whose modality is a member of
the configured recognition-modality set SHALL count toward this projection; events from a non-recognition
modality (e.g. an exposure interaction) SHALL be excluded from the computation entirely. A character
SHALL transition to `known` only after at least two consecutive correct recognition-modality responses
with response latency below the configured guess-detection threshold. A character previously `known`
SHALL transition to `shaky` on any incorrect recognition-modality response or any correct
recognition-modality response with latency above the configured slow-response threshold.

#### Scenario: Two fast correct responses promote to known
- **WHEN** a character has at least two consecutive correct recognition-modality responses, each with
  latency below the guess-detection threshold
- **THEN** its mastery state SHALL be `known`

#### Scenario: A single miss demotes a known character
- **WHEN** a character in state `known` receives an incorrect recognition-modality response
- **THEN** its mastery state SHALL transition to `shaky`

#### Scenario: Slow correct response does not count toward known
- **WHEN** a character receives a correct recognition-modality response with latency above the
  guess-detection threshold
- **THEN** that response SHALL NOT count toward the two-consecutive-correct requirement for promotion to
  `known`

#### Scenario: Non-recognition-modality events are excluded from the projection
- **WHEN** a character has one or more logged events whose modality is not in the configured
  recognition-modality set
- **THEN** those events SHALL NOT count toward or against that character's mastery state transitions,
  regardless of their outcome or latency

#### Scenario: Teaching activities do not promote mastery
- **WHEN** a character's event history contains only events whose modality is not in the configured
  recognition-modality set
- **THEN** the character has no mastery-projection entry at all, regardless of how many events or how
  fast their outcomes were
