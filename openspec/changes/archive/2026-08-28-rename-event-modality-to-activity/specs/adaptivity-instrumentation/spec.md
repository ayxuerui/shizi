## MODIFIED Requirements

### Requirement: No inference performed in this change

The system SHALL NOT compute or surface any per-activity teaching-effectiveness estimate,
retention-model output, or routing decision based on the logged data in this change. Data
collection and randomization SHALL be fully separated from any future inference component.

#### Scenario: Modality comparison data collected without a comparison result
- **WHEN** matched-pair assignments and their associated events accumulate over multiple sessions
- **THEN** the system SHALL make this data available for later analysis but SHALL NOT produce any effectiveness ranking, score, or recommendation from it within this change
