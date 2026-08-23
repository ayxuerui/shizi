## MODIFIED Requirements

### Requirement: Backup automation commits only the canonical export
The automated backup process SHALL stage and commit only the canonical export files. It SHALL
NOT commit unrelated local changes, and SHALL refuse to run rather than silently include them if
the working copy it operates from has other uncommitted changes. The set of canonical export files
SHALL include every durable learner-record stream the export produces, not a subset of them, so that
adding a stream cannot cause the backup to either omit it or refuse to run.

#### Scenario: The deploy clone has unrelated local edits
- **WHEN** the backup automation runs and the clone it operates from has uncommitted changes
  outside the canonical export files
- **THEN** it SHALL refuse to commit and SHALL report the conflicting state rather than folding
  those changes into its commit

#### Scenario: Only the export changed
- **WHEN** the backup automation runs and the only difference is newly exported event, rating, or
  character-tag data
- **THEN** it SHALL commit exactly those files and push

#### Scenario: A newly added export stream is present
- **WHEN** the export produces a durable stream that the backup automation's canonical-file set does
  not yet name
- **THEN** the backup SHALL NOT treat that stream as an unrelated local change
- **AND** it SHALL NOT refuse to run on account of it
