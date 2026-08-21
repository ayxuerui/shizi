## Purpose

Defines this project's environment topology: how many self-hosted deployments exist, what each
one must and must not share with the others, and what protects the canonical repo-side learner
record from data produced by non-production environments. Exists because the assessment app's
riskiest verification steps are device-only, and running them against the live deployment means
running them against the child's own app and her real event history.

## ADDED Requirements

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

#### Scenario: The marker never enters the child-facing activity
- **WHEN** a non-production build is running a learner activity
- **THEN** no environment marker SHALL be rendered within that activity, preserving the assessment
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
