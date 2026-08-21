## MODIFIED Requirements

### Requirement: Production identity is independent of the working copy
Production's containers and storage volumes SHALL be identified by fixed names that do not
derive from the filesystem location of the checkout they were launched from. Production SHALL be
startable from a fresh clone of the repository, attaching to its existing event store, without
renaming or recreating that store. Production SHALL additionally continue serving with no
working copy of the repository present on the host at all: no running behavior may depend on a
path inside a checkout.

#### Scenario: Production started from a different checkout
- **WHEN** production is brought up from a different checkout of the repository than the one that last started it
- **THEN** it SHALL attach to the same event store, with the same container and volume names, and
  SHALL NOT create a parallel empty store

#### Scenario: The launching checkout is deleted
- **WHEN** the directory production was originally launched from no longer exists
- **THEN** production SHALL remain manageable and its event store SHALL remain reachable by name

#### Scenario: Every checkout on the host is deleted
- **WHEN** no working copy of the repository exists anywhere on the host
- **THEN** production SHALL continue serving the application and its sync endpoint unchanged
- **AND** it SHALL still do so after being restarted or recreated in that state

## ADDED Requirements

### Requirement: Production serves a released artifact, not a working tree
Production SHALL serve the application from an immutable artifact built from a known commit,
rather than reading it from a filesystem location that anything else can modify in place.
Modifying, emptying, or deleting any working copy SHALL NOT be capable of changing or breaking
what production serves. Replacing what production serves SHALL be a deliberate release action.

#### Scenario: A working copy's build output is deleted while production runs
- **WHEN** the build output directory in any checkout is deleted, emptied, or rebuilt in place
- **THEN** production SHALL continue serving its current release, unaffected
- **AND** this SHALL remain true across a restart of the serving container

#### Scenario: Releasing a new version
- **WHEN** a new version is to go live
- **THEN** it SHALL require an explicit release step, and SHALL NOT happen as a side effect of
  building, branch-switching, or editing files in any checkout

#### Scenario: Returning to the previous release
- **WHEN** a release turns out to be bad
- **THEN** the previously released artifact SHALL still be identifiable and re-servable without
  rebuilding it from source

### Requirement: Published learner config is updatable without a new release
The published learner config — the derived data that adapts the application to this learner's
current state — SHALL be updatable independently of the application artifact. Regenerating it
SHALL NOT require rebuilding or re-releasing the application, because it is derived data rather
than code and changes on a different cadence.

#### Scenario: Config regenerated after a session
- **WHEN** the published config is regenerated from a newer event history
- **THEN** the running production deployment SHALL be able to serve the updated config without a
  new application release

#### Scenario: Config is absent or unreadable
- **WHEN** no published config is available to serve
- **THEN** the application SHALL continue to function using its own bundled fallback, exactly as
  it does today

#### Scenario: Updating config cannot break the application artifact
- **WHEN** the published config is replaced with a malformed or truncated file
- **THEN** the application itself SHALL still be served intact, and SHALL fall back rather than
  fail

### Requirement: Deployment credentials survive deletion of every working copy
Credentials production needs in order to start — including the sync shared token — SHALL be
stored outside every git working tree, so that deleting a checkout, switching branches, or
discarding untracked files cannot destroy them. The stored value SHALL remain the one the
currently released application was built against.

#### Scenario: Untracked files are discarded in a checkout
- **WHEN** untracked and ignored files are removed from any checkout of the repository
- **THEN** production SHALL still be able to start, and SHALL still authenticate sync requests
  from the currently released application

#### Scenario: The shared token is rotated
- **WHEN** the sync shared token is changed
- **THEN** a new application release built against the new value SHALL be required before clients
  can sync again, and this coupling SHALL be stated wherever the rotation procedure is documented

### Requirement: Non-production may serve directly from a working tree
The non-production environment SHALL be permitted to serve the application directly from a
working copy, because reflecting the tree under verification is its purpose. This asymmetry with
production is intended: the two environments SHALL NOT be made uniform in this respect, and the
distinction SHALL be documented so it is not later removed as an inconsistency.

#### Scenario: Verifying an uncommitted change
- **WHEN** a candidate build in a working copy is rebuilt
- **THEN** the non-production environment SHALL be able to serve it without any release step

#### Scenario: The asymmetry is deliberate
- **WHEN** the two environments' sources of served content are compared
- **THEN** production's SHALL be a released artifact and non-production's MAY be a working copy,
  and this SHALL be recorded as intended rather than as drift
