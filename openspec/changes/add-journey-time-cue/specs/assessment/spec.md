## MODIFIED Requirements

### Requirement: Narrative framing
The assessment SHALL present each probe as helping a character achieve a visible, story-relevant goal (e.g., identifying a character needed to continue a journey), rather than as an isolated test item with no framing.

#### Scenario: Probe presented in-story
- **WHEN** the system presents a character-recognition probe to the learner
- **THEN** it SHALL be framed within an ongoing narrative goal, not shown as a bare question

#### Scenario: Progress advances regardless of accuracy
- **WHEN** a probe is answered, correctly or incorrectly
- **THEN** the narrative SHALL advance to its next beat; the story SHALL NOT halt or visibly branch based on a single incorrect response

#### Scenario: Elapsed-bout progress cue is non-numeric
- **WHEN** the system displays any visual indication of how far along the current bout is (elapsed time, items answered, or proximity to the bout's end)
- **THEN** that indication SHALL be purely graphical — no digit, percentage, or countdown text — and SHALL NOT change color or style to signal urgency or a deadline
