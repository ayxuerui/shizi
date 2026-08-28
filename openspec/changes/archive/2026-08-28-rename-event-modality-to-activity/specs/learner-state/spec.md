## MODIFIED Requirements

### Requirement: Known-set and mastery projection

The system SHALL derive, for every character in the candidate pool, a mastery state of `unseen`,
`probing`, `known`, or `shaky`, computed from the event log. A character SHALL transition to
`known` only after at least two consecutive correct responses with response latency below the
configured guess-detection threshold. A character previously `known` SHALL transition to `shaky`
on any incorrect response or any correct response with latency above the configured slow-response
threshold. Only **recognition-activity evidence** — a correct `hear-tap` response — SHALL count
toward promotion; `listen` and `trace` activities are teaching interactions and SHALL never
promote a character toward `known`, whatever their outcome.

#### Scenario: Two fast correct responses promote to known
- **WHEN** a character has at least two consecutive correct `hear-tap` responses, each with latency below the guess-detection threshold
- **THEN** its mastery state SHALL be `known`

#### Scenario: A single miss demotes a known character
- **WHEN** a character in state `known` receives an incorrect response
- **THEN** its mastery state SHALL transition to `shaky`

#### Scenario: Slow correct response does not count toward known
- **WHEN** a character receives a correct `hear-tap` response with latency above the guess-detection threshold
- **THEN** that response SHALL NOT count toward the two-consecutive-correct requirement for promotion to `known`

#### Scenario: Teaching activities do not promote mastery
- **WHEN** a character's event history contains only `listen` and `trace` activities
- **THEN** the character has no mastery-projection entry at all, regardless of how many events
  or how fast their outcomes were
