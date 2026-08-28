## ADDED Requirements

### Requirement: Focused probing scope
The assessment SHALL accept an optional focused character set supplied by the orchestrator. When a focused set is present, informative probes derived from frontier search SHALL target only characters in the focused set. Guaranteed-success dilution items, forced identity/`shaky` confirmation slots, and distractor generation SHALL continue to draw from their existing sources (identity set ∪ confirmed-known set, and the full pool respectively), so focusing changes what is measured, not how bouts stay survivable or how options are built.

#### Scenario: Informative probes stay inside the focused set
- **WHEN** a session is created with a focused character set and generates a frontier-derived informative probe
- **THEN** that probe's target character SHALL be a member of the focused set

#### Scenario: Dilution continues from broader sources under focus
- **WHEN** a session runs with a focused character set
- **THEN** it SHALL still include easy guaranteed-success items drawn from the identity set ∪ confirmed-known set at the configured ratio, including characters outside the focused set

#### Scenario: Forced identity/shaky slots may fall outside focus
- **WHEN** a forced identity/`shaky` confirmation slot arrives and no focused-set character qualifies for it
- **THEN** the system SHALL still fill the slot from the identity set ∪ `shaky` characters even though they lie outside the focused set

#### Scenario: Distractor generation uses whole-pool attributes
- **WHEN** a probe is generated for a focused-set target
- **THEN** its distractor options SHALL continue to be selected using attributes of candidates from the full pool, not restricted to the focused set

#### Scenario: Bout concludes when the focused set is resolved
- **WHEN** every character in the focused set has reached a resolved outcome (confirmed known per the confirmation rule, or exhausted by the session's own re-probe discipline) before the duration or item-count bound
- **THEN** the session SHALL conclude with its normal closing beat rather than continuing to probe
