## ADDED Requirements

### Requirement: The canonical event store lives at a fixed, host-discoverable location
Production's event store SHALL be stored at a location on the host that is fixed and known in
advance, rather than one that must be discovered through container-runtime tooling. Any host-side
process needing direct access to the live store SHALL be able to reference that location without
first querying the state of any running container or the container runtime.

#### Scenario: A host-side script needs the live store
- **WHEN** a script running directly on the host needs to read the live event store
- **THEN** it SHALL be able to do so using a location known in advance
- **AND** it SHALL NOT need to query the container runtime to discover where that data lives

#### Scenario: The store survives exactly as it did before this requirement
- **WHEN** the sync service's container is stopped, recreated, or rebuilt
- **THEN** the event store SHALL retain everything it held beforehand, exactly as it already did
  before this capability existed

### Requirement: The canonical learner record is backed up automatically and off-machine
The canonical repo-side event export SHALL be regenerated and pushed to the project's remote git
host on a recurring schedule, without requiring a person to remember to run it. A person's
absence, for any length of time, SHALL NOT cause backups to stop occurring.

#### Scenario: New events accumulate between manual actions
- **WHEN** real sessions are recorded through the sync endpoint and no person runs any export
  command
- **THEN** the canonical export SHALL still be regenerated, committed, and pushed within one
  scheduled interval of those events landing

#### Scenario: The operator is away
- **WHEN** the person who normally operates this deployment does not log into the host for an
  extended period
- **THEN** the backup schedule SHALL continue to run and push regardless

### Requirement: Backup automation commits only the canonical export
The automated backup process SHALL stage and commit only the canonical export files. It SHALL
NOT commit unrelated local changes, and SHALL refuse to run rather than silently include them if
the working copy it operates from has other uncommitted changes.

#### Scenario: The deploy clone has unrelated local edits
- **WHEN** the backup automation runs and the clone it operates from has uncommitted changes
  outside the canonical export files
- **THEN** it SHALL refuse to commit and SHALL report the conflicting state rather than folding
  those changes into its commit

#### Scenario: Only the export changed
- **WHEN** the backup automation runs and the only difference is newly exported event/rating data
- **THEN** it SHALL commit exactly those files and push

### Requirement: Backup automation coexists with unrelated scheduled jobs on the same host
Installing this backup schedule SHALL NOT remove, disable, or otherwise disturb any other
scheduled job already present on the host. Installing it SHALL be repeatable without creating
duplicate entries.

#### Scenario: The host already runs unrelated scheduled jobs
- **WHEN** this backup schedule is installed on a host that already runs scheduled jobs for
  other purposes
- **THEN** those other jobs SHALL continue to run on their existing schedule, unmodified

#### Scenario: Installing the schedule twice
- **WHEN** the installation step is run more than once
- **THEN** exactly one entry for this backup job SHALL exist afterward, not a duplicate

### Requirement: Backup health is observable without additional infrastructure
Whether the backup mechanism is currently working SHALL be answerable by inspecting the
project's own version history, without operating or trusting any separate monitoring system.

#### Scenario: Checking backup health
- **WHEN** someone wants to know whether backups are current
- **THEN** the timestamp of the most recent canonical-export commit SHALL by itself answer that
  question

#### Scenario: An unchanged event log still proves the mechanism ran
- **WHEN** the backup automation runs and no new events exist since the last run
- **THEN** this SHALL be distinguishable from the automation having not run at all, rather than
  looking identical to silence

### Requirement: The backup push credential is independent of any interactive login
The credential used to push the canonical export SHALL remain valid independent of any person's
interactive session state, and SHALL be scoped no more broadly than this repository requires.

#### Scenario: The operator's interactive session ends or expires
- **WHEN** the person who set up this automation logs out, or their separate interactive
  credentials expire or are revoked
- **THEN** the backup push credential SHALL remain valid and pushes SHALL continue to succeed

### Requirement: Client-side retention is a documented, relied-upon backstop
The offline client SHALL retain every event it has recorded, including after that event has been
successfully synced, for as long as the device's storage allows. This property SHALL be treated
as an explicit backstop this backup design depends on, not merely an incidental implementation
detail, until the device's actual storage-retention behavior under real-world conditions has
been confirmed.

#### Scenario: A synced event is not deleted client-side
- **WHEN** an event is confirmed synced to the host
- **THEN** the client SHALL continue to retain that event rather than deleting it

#### Scenario: The backstop's real limits are unknown, and that is stated, not assumed
- **WHEN** this backstop's reliability is assessed
- **THEN** the assessment SHALL state plainly that the device's real-world storage-eviction
  behavior over time has not yet been confirmed, rather than treating client-side retention as an
  unconditional guarantee

### Requirement: Non-production's event store is exempt from the fixed-location requirement
The non-production environment's event store SHALL NOT be required to use a fixed,
host-discoverable location, and MAY remain in Docker-managed storage instead. This asymmetry
with production is intended: non-production data is disposable by design, and requiring a
durable, host-discoverable location for data that is expected to be torn down would add
operational burden with no corresponding benefit.

#### Scenario: Tearing down the non-production environment
- **WHEN** the non-production environment and its storage are destroyed and recreated
- **THEN** no host-side cleanup of a fixed-location directory SHALL be required
