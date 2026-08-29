## MODIFIED Requirements

### Requirement: Felt-difficulty dilution
The assessment SHALL mix informative (frontier-adjacent) probes with easy, guaranteed-success items
(such as identity-set characters or already-confirmed-known characters) at a configured ratio
(default: 4 easy items per 1 informative probe), so the learner's felt success rate stays
substantially above chance. The easy items SHALL be drawn from the review queue first — a due unit is
by definition one the learner has already learned, so serving it in an easy slot preserves the
guaranteed-success intent while making review happen — and SHALL fall back to identity-set and
confirmed-known items when no unit is due. The share of a bout's easy slots that review may consume
SHALL be capped by configuration, so a large backlog of due units cannot displace every guaranteed-
success item.

#### Scenario: Session includes guaranteed-success items
- **WHEN** an assessment session is generated
- **THEN** it SHALL include easy items at approximately the configured ratio relative to informative
  probes, not consist solely of maximally-informative (and therefore harder) items

#### Scenario: Due units fill easy slots
- **WHEN** a bout is generated while units are due for review
- **THEN** its easy slots SHALL be filled from the review queue, most at-risk unit first, rather than
  from an arbitrary rotation of known items

#### Scenario: Nothing due behaves as before
- **WHEN** a bout is generated while no unit is due for review
- **THEN** its easy slots SHALL be filled from identity-set and confirmed-known items exactly as they
  would be with no review scheduling present

#### Scenario: Review backlog does not consume every easy slot
- **WHEN** the number of due units exceeds the configured review share of a bout's easy slots
- **THEN** review SHALL fill only up to that share, and the remaining easy slots SHALL be filled from
  identity-set and confirmed-known items

#### Scenario: Informative probe slots are unaffected
- **WHEN** a bout is generated while units are due for review
- **THEN** the slots reserved for informative frontier probes SHALL still be filled by frontier
  selection, unchanged by the review queue
