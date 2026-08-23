## Purpose

Supplies the 句 tier — short sentences built from words the learner already knows — as a reviewed, version-controlled bank produced by an authoring-time generation pipeline, so that generated language reaches the learner only after mechanical validation and human approval.

## ADDED Requirements

### Requirement: Sentences are composed only of pool words
Every sentence in the bank SHALL be composed exclusively of words present in the word candidate pool, and SHALL record its component words in order. A sentence containing any span not covered by a pool word SHALL be rejected.

#### Scenario: Sentence with an out-of-pool word is rejected
- **WHEN** a candidate sentence contains a word absent from the word candidate pool
- **THEN** that sentence SHALL NOT enter the bank

#### Scenario: Component words recorded for gating
- **WHEN** a sentence is admitted to the bank
- **THEN** its component words SHALL be stored with it, so eligibility can be computed without re-segmenting the sentence text

### Requirement: Generation happens at authoring time, never in the learner's app
Sentence generation SHALL run as a repository-side authoring process. The learner-facing application SHALL NOT call any language-model service at runtime, and SHALL read sentences only from data committed to the repository.

#### Scenario: App runs with no model service reachable
- **WHEN** the learner uses the application with no network connectivity
- **THEN** the sentence tier SHALL function normally from committed data, since no runtime generation is involved

#### Scenario: No generation credentials in the shipped app
- **WHEN** the application bundle is inspected
- **THEN** it SHALL contain no language-model credentials and no calls to a generation service

### Requirement: Every generated sentence passes validation before review
Each generated candidate SHALL be submitted to the content validator against the intended learner state, and any candidate with a hard failure SHALL be discarded automatically rather than forwarded for human review.

#### Scenario: Candidate with a hard validation failure is discarded
- **WHEN** a generated candidate fails a hard validation check
- **THEN** the pipeline SHALL discard it without presenting it for review, and SHALL record that it was generated and rejected

#### Scenario: Validation precedes review
- **WHEN** a candidate is presented for human review
- **THEN** it SHALL already have passed every hard validation check

### Requirement: Human approval gates entry to the bank
No generated sentence SHALL reach the learner without explicit human approval recorded in the repository. Validation passing SHALL NOT by itself admit a sentence to the bank.

#### Scenario: Unreviewed candidate is not served
- **WHEN** a candidate has passed validation but has not been approved by a human
- **THEN** it SHALL NOT be eligible for presentation to the learner

#### Scenario: Approval is recorded as data
- **WHEN** a sentence is approved
- **THEN** the approval SHALL be recorded in version control alongside the sentence, so the reviewed state of the bank is reproducible

### Requirement: Generated-content provenance
Each sentence in the bank SHALL record that it was model-generated, along with enough provenance to reproduce and audit its creation — at minimum the generating model identifier and the learner-state assumption it was generated against.

#### Scenario: Provenance available for audit
- **WHEN** a sentence in the bank is inspected
- **THEN** its provenance SHALL identify it as generated and name the model that produced it

#### Scenario: Regeneration is traceable
- **WHEN** the sentence bank is regenerated after a change to the word pool
- **THEN** each resulting sentence SHALL carry provenance distinguishing it from sentences produced by an earlier run

### Requirement: Sentences are bounded in length and novelty
Each sentence SHALL be bounded to a configured maximum word count appropriate for a preschool-age learner, and the bank SHALL avoid near-duplicate sentences so that repeated sessions do not present the learner with the same construction.

#### Scenario: Over-long sentence rejected
- **WHEN** a candidate exceeds the configured maximum word count
- **THEN** it SHALL be rejected before review

#### Scenario: Near-duplicate rejected
- **WHEN** a candidate is a near-duplicate of a sentence already in the bank
- **THEN** the pipeline SHALL reject it rather than admit a second copy of the same construction
