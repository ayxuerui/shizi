## Purpose

Discovers which characters a preschool-age learner actually recognizes through adaptive play rather than parent enumeration, while feeling entirely like helping a story character rather than being tested — since a felt sense of failure at this age risks the learner disengaging from the entire project.

## ADDED Requirements

### Requirement: Adaptive frontier-search probing
The assessment SHALL select which character to probe next using an adaptive strategy that locates the boundary between characters the learner knows and does not know, rather than probing the full candidate pool exhaustively or in a fixed order. It SHALL prioritize probes expected to be most informative about that boundary, while narrowing toward a dense sweep once an approximate boundary is found.

#### Scenario: Coarse probing before narrowing
- **WHEN** an assessment session begins with no prior knowledge of the learner's frontier
- **THEN** the system SHALL probe characters spanning a wide difficulty range before concentrating probes in a narrower band

#### Scenario: Narrowing around the discovered frontier
- **WHEN** the system has identified an approximate boundary between known and unknown characters
- **THEN** subsequent probes in that session SHALL concentrate on characters near that boundary rather than continuing to sample broadly

#### Scenario: Identity and previously-flagged characters are probed too
- **WHEN** a session runs
- **THEN** the system SHALL include the learner's identity-set characters and any `shaky`-state characters as probe candidates alongside frontier-search candidates, since these can violate a purely difficulty-ordered assumption

### Requirement: Guess detection via confirmation and latency
The assessment SHALL NOT mark a character as recognized from a single correct response. It SHALL require at least two consistent correct responses, each with response latency below a configured threshold, before marking a character as known. A correct response with latency above the threshold SHALL be treated as an inconclusive result, not as evidence of recognition.

#### Scenario: Single correct tap is inconclusive
- **WHEN** a learner responds correctly to a character for the first time in an assessment
- **THEN** the system SHALL NOT yet classify that character as known, and SHALL schedule a later confirming probe

#### Scenario: Fast confirming response marks known
- **WHEN** a learner responds correctly to the same character a second time, with latency below the configured threshold
- **THEN** the system SHALL classify that character as known

#### Scenario: Slow correct response does not confirm
- **WHEN** a learner's correct response has latency above the configured threshold
- **THEN** the system SHALL treat the result as inconclusive rather than as confirming evidence, regardless of correctness

### Requirement: Felt-difficulty dilution
The assessment SHALL mix informative (frontier-adjacent) probes with easy, guaranteed-success items (such as identity-set characters or already-confirmed-known characters) at a configured ratio (default: 4 easy items per 1 informative probe), so the learner's felt success rate stays substantially above chance.

#### Scenario: Session includes guaranteed-success items
- **WHEN** an assessment session is generated
- **THEN** it SHALL include easy items at approximately the configured ratio relative to informative probes, not consist solely of maximally-informative (and therefore harder) items

### Requirement: No visible scoring or failure state
The assessment SHALL NOT display a numeric score, a pass/fail result, a count of mistakes, or any negative visual/audio feedback for an incorrect response. An incorrect response SHALL be followed only by a neutral or gentle redirect, and the activity SHALL continue.

#### Scenario: Incorrect response
- **WHEN** a learner taps an incorrect option
- **THEN** the system SHALL respond with a neutral/gentle cue (no error sound, no red indicator, no score change) and SHALL allow the activity to continue

#### Scenario: No cumulative score shown
- **WHEN** a learner completes any portion of a session
- **THEN** the system SHALL NOT display a running or final numeric score, percentage, or pass/fail summary to the learner

### Requirement: Narrative framing
The assessment SHALL present each probe as helping a character achieve a visible, story-relevant goal (e.g., identifying a character needed to continue a journey), rather than as an isolated test item with no framing.

#### Scenario: Probe presented in-story
- **WHEN** the system presents a character-recognition probe to the learner
- **THEN** it SHALL be framed within an ongoing narrative goal, not shown as a bare question

#### Scenario: Progress advances regardless of accuracy
- **WHEN** a probe is answered, correctly or incorrectly
- **THEN** the narrative SHALL advance to its next beat; the story SHALL NOT halt or visibly branch based on a single incorrect response

### Requirement: Bounded session length
The assessment SHALL be structured as short bouts (approximately 60–90 seconds) rather than a single long testing session, and SHALL allow multiple bouts per day.

#### Scenario: Session reaches its bound
- **WHEN** a bout reaches its configured time or item-count bound
- **THEN** the system SHALL conclude the bout with a positive closing beat rather than continuing to probe

### Requirement: Assessment results feed learner state
Every probe outcome, including inconclusive ones, SHALL be written to the learner's event log (per the learner-state capability) and SHALL contribute to that learner's known-set and mastery projections. The assessment SHALL NOT maintain a separate, disconnected record of what the learner knows.

#### Scenario: Confirmed-known character updates learner state
- **WHEN** the assessment confirms a character as known
- **THEN** that character's mastery state in the learner-state projection SHALL reflect `known` without any additional manual step

### Requirement: Difficulty calibration (Loop 4)
The assessment SHALL adjust the visual confusability of distractor options over time to hold the learner's rolling accuracy within a target band (default: 80–85%), tightening distractor confusability when accuracy is above the band and loosening it when below.

#### Scenario: Accuracy above target band
- **WHEN** the learner's rolling accuracy rises above the configured upper bound
- **THEN** subsequent distractors SHALL be selected to be more visually confusable with the target

#### Scenario: Accuracy below target band
- **WHEN** the learner's rolling accuracy falls below the configured lower bound
- **THEN** subsequent distractors SHALL be selected to be less visually confusable with the target

### Requirement: Touch and stylus input support
The assessment SHALL accept both finger-touch and stylus (Apple Pencil) input for selecting an option, SHALL suppress incidental palm-touch input while a stylus is in use, and SHALL present touch targets sized for a preschool-age child's motor control.

#### Scenario: Stylus input with resting palm
- **WHEN** the learner is actively using the stylus and their palm rests on the screen
- **THEN** the system SHALL ignore the palm contact and SHALL register only the stylus interaction

#### Scenario: Finger-only interaction
- **WHEN** no stylus is present
- **THEN** the system SHALL accept finger-touch input for all interactions

### Requirement: Full offline operation
The assessment SHALL be fully usable with no network connectivity, including narration audio and visual assets already delivered to the device, queuing any generated events for later sync per the learner-state capability.

#### Scenario: Session run with no connectivity
- **WHEN** the device has no network connection
- **THEN** the learner SHALL be able to complete a full assessment bout with no visible degradation, and resulting events SHALL be queued for later sync
