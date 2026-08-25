## Purpose

Defines this project's environment topology: how many self-hosted deployments exist, what each
one must and must not share with the others, and what protects the canonical repo-side learner
record from data produced by non-production environments. Exists because the assessment app's
riskiest verification steps are device-only, and running them against the live deployment means
running them against the child's own app and her real event history.

## Requirements

### Requirement: Isolated non-production environment
The project SHALL provide a non-production deployment, in addition to production, that serves a
build of the same application. The two environments SHALL be independently addressable, and
SHALL NOT share an event store, an authentication token, a container, or a storage volume.
Stopping, restarting, rebuilding, or reconfiguring the non-production environment SHALL have no
effect on production's availability or data.

#### Scenario: Verifying a candidate build without touching production
- **WHEN** a candidate build is deployed to the non-production environment
- **THEN** the production environment continues serving its own previously deployed build
- **AND** no request to the non-production environment reaches production's event store

#### Scenario: Non-production is rebuilt from scratch
- **WHEN** the non-production environment's containers and storage volume are destroyed and recreated
- **THEN** production's event store retains every event it held beforehand

#### Scenario: A credential leaked from one environment does not open the other
- **WHEN** a request presents the non-production environment's shared token to production's sync endpoint
- **THEN** the request SHALL be rejected as unauthorized
- **AND** the same SHALL hold with the roles reversed

### Requirement: Canonical learner record is protected from non-production data
The repo-side JSONL export is this project's canonical, durable learner record. The export tool
SHALL NOT write that canonical location when operating against a non-production event store.
Exporting non-production data SHALL require the caller to name a destination explicitly.

#### Scenario: Export run against a non-production store with no destination given
- **WHEN** the export tool runs in a non-production environment without an explicit destination
- **THEN** it SHALL fail with a message naming the canonical location it refused to write
- **AND** it SHALL leave that location unmodified, including when no such file exists yet

#### Scenario: Export run against a non-production store with a destination given
- **WHEN** the export tool runs in a non-production environment with an explicit destination outside the canonical location
- **THEN** it SHALL write the non-production events there and succeed

#### Scenario: Production export is unchanged
- **WHEN** the export tool runs in the production environment with no explicit destination
- **THEN** it SHALL write the canonical location exactly as it did before this capability existed

### Requirement: Deployed builds declare their environment
A build SHALL carry the identity of the environment it was built for, so that a device with both
environments installed can tell them apart without inspecting the address bar. Non-production
builds SHALL present a distinct installed-application name and SHALL surface a visible
environment marker in the application.

#### Scenario: Both environments installed on the same device
- **WHEN** both a production and a non-production build are added to a device's home screen
- **THEN** they SHALL appear as two separately named applications, neither replacing the other

#### Scenario: Environment marker is visible before a session starts
- **WHEN** a non-production build is opened
- **THEN** an environment marker SHALL be visible on the first screen shown at every cold start

#### Scenario: The marker never enters the child-facing module
- **WHEN** a non-production build is running a learner module
- **THEN** no environment marker SHALL be rendered within that module, preserving the assessment
  capability's guarantee that no score-like or status-like text appears during play

#### Scenario: Production builds are unmarked
- **WHEN** a production build is opened
- **THEN** no environment marker SHALL be rendered on any screen, and the installed-application
  name SHALL be unchanged from before this capability existed

### Requirement: Environments serve identical routing behavior
Every environment SHALL serve the application under the same path prefix and with the same
request-handling rules — redirects, content types, cache directives, and the placement of the
sync endpoint relative to the application. The only permitted difference is which environment's
sync service a given environment's gateway forwards to. Routing rules SHALL have a single
source of truth, so that a rule added or corrected in one environment cannot silently be absent
from another.

#### Scenario: A routing rule is corrected
- **WHEN** a request-handling rule is changed
- **THEN** the change SHALL take effect in every environment without being restated per environment

#### Scenario: Parity is checkable, not assumed
- **WHEN** the effective routing configuration of each running environment is inspected
- **THEN** the configurations SHALL be identical apart from the sync-service destination

### Requirement: Each gateway reaches only its own sync service
An environment's gateway SHALL forward sync requests to that environment's own sync service and
to no other, deterministically, regardless of which other environments are running or the order
in which they were started.

#### Scenario: Both environments running at once
- **WHEN** a sync request is sent to the non-production environment while production is also running
- **THEN** it SHALL be handled by the non-production sync service on every attempt, never by production's

#### Scenario: Environments started in either order
- **WHEN** the environments are started in either order, or one is restarted while the other runs
- **THEN** each gateway's sync destination SHALL be unaffected

### Requirement: Production identity is independent of the working copy
Production's containers and storage volumes SHALL be identified by fixed names that do not
derive from the filesystem location of the checkout they were launched from. Production SHALL be
startable from a fresh clone of the repository, attaching to its existing event store, without
renaming or recreating that store.

#### Scenario: Production started from a different checkout
- **WHEN** production is brought up from a different checkout of the repository than the one that last started it
- **THEN** it SHALL attach to the same event store, with the same container and volume names, and
  SHALL NOT create a parallel empty store

#### Scenario: The launching checkout is deleted
- **WHEN** the directory production was originally launched from no longer exists
- **THEN** production SHALL remain manageable and its event store SHALL remain reachable by name

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
