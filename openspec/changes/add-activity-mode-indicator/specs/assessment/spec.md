## ADDED Requirements

### Requirement: The bout identifies its module and activity on screen

Throughout an assessment bout, the screen SHALL persistently display a small indicator identifying
the running activity and the activity that delivers it in bilingual text (English and Chinese, e.g.
`测 ASSESS · 听选 HEAR-TAP`). The indicator SHALL be purely graphical text positioned and styled as
parent-facing chrome: it SHALL contain no digit, percentage, countdown, or any other score-like
element, SHALL NOT use color or emphasis that signals urgency or evaluation, and SHALL be visually
subordinate to the child-facing content. The indicator is informational for a supervising adult; a
learner who cannot read it SHALL experience no difference in the activity.

#### Scenario: Parent can see what is running

- **WHEN** an assessment bout is being delivered
- **THEN** the screen shows a persistent indicator naming the assessment module and its hear-tap
  activity in both English and Chinese

#### Scenario: The indicator never becomes a score

- **WHEN** the indicator is rendered at any point in the bout, including the closing beat
- **THEN** it contains no digit or percentage anywhere in its text, consistent with the
  no-visible-scoring guarantee that already applies to the whole bout tree

#### Scenario: Visually subordinate to child content

- **WHEN** the indicator is displayed alongside probes, cues, or the closing beat
- **THEN** it is rendered smaller and visually quieter than the child-facing content, in a fixed
  position, without animation that could draw the learner's attention away from the task
