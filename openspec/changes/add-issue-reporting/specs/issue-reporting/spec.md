## Purpose

Lets the accompanying adult file a bug report or feature request from inside the app at the moment
it occurs, and guarantees the report reaches the project's durable, version-controlled record with
enough automatically-captured context to act on — without ever surfacing inside the child-facing
activity.

## ADDED Requirements

### Requirement: Adult can file a report from inside the app
The system SHALL provide an adult-facing report form within the application through which a report
of kind "bug" or "feature request" together with a free-text message can be submitted. The form
SHALL be reachable from the adult-facing entry the application already presents at every cold start,
including when installed to the home screen with no address bar, and SHALL additionally be reachable
via a URL fragment for desk testing. A report SHALL require a non-empty message, and the message
SHALL be bounded to a fixed maximum length.

#### Scenario: Filing a bug report from the installed app
- **WHEN** the adult opens the adult-facing entry on a cold start of the installed app, chooses the report form, selects the "something went wrong" kind, types a message, and saves
- **THEN** the report SHALL be accepted and the adult SHALL see confirmation that it has been saved on this device and will be sent automatically

#### Scenario: Filing a feature request
- **WHEN** the adult selects the "idea" kind, types a message, and saves
- **THEN** the report SHALL be accepted with kind "feature request" and the same confirmation SHALL be shown

#### Scenario: Empty message
- **WHEN** the adult attempts to save with an empty or whitespace-only message
- **THEN** the system SHALL NOT create a report and the save control SHALL be unavailable

#### Scenario: Message at the size bound
- **WHEN** the adult's message reaches the maximum permitted length
- **THEN** the form SHALL NOT accept further characters and SHALL still allow the report to be saved

#### Scenario: Desk-testing entry via URL fragment
- **WHEN** the application is opened with the report URL fragment
- **THEN** the report form SHALL be shown instead of the unlock screen
- **AND** leaving the form SHALL clear the fragment so that a reload does not return to it

### Requirement: Reports carry diagnostic context automatically
Every report SHALL record, without the adult typing any of it: the environment the build was made
for, the build identifier, the browser user-agent string, whether the app is running installed to the
home screen, whether the device was online when the report was written, the time it was written, and
— when any learner activity has been recorded on the device — the identifier of the most recently
recorded session and the module and activity that produced it.

#### Scenario: Report written after a session
- **WHEN** a report is written on a device that has recorded at least one learner event
- **THEN** the report SHALL include the session identifier and the module/activity of the most recently recorded event

#### Scenario: Report written on a fresh device
- **WHEN** a report is written on a device that has never recorded a learner event
- **THEN** the report SHALL still be accepted, with the session and activity fields explicitly empty rather than absent

#### Scenario: Build without a build identifier
- **WHEN** the running build was produced without a build identifier supplied
- **THEN** the report SHALL record a literal "unknown" build identifier rather than omit the field

#### Scenario: Non-production build
- **WHEN** a report is written from a non-production build
- **THEN** the report SHALL identify that environment, so a report from a verification session is never mistaken for one from the child's own app

### Requirement: Reports are written offline-first and synced idempotently
Writing a report SHALL succeed with no network connectivity: the report SHALL be stored on the
device first and sent when connectivity is next available, following the same opportunistic sync
behavior as learner events. Each report SHALL carry a client-generated unique identifier such that
delivering it more than once SHALL NOT create a duplicate record. A failed or rejected send SHALL
leave the report stored for retry and SHALL NOT surface an error inside any learner activity.

#### Scenario: Report written offline
- **WHEN** the adult saves a report while the device has no connectivity
- **THEN** the report SHALL be stored locally, the confirmation SHALL be shown, and the report SHALL be sent the next time a sync opportunity arises

#### Scenario: Duplicate delivery
- **WHEN** the same report is delivered to the sync endpoint more than once, for instance after a dropped connection
- **THEN** exactly one record SHALL exist for that identifier

#### Scenario: Pending reports are visible to the adult
- **WHEN** the report form is opened while reports written on this device are still waiting to be sent
- **THEN** the form SHALL show how many are waiting

#### Scenario: Sent reports are retained on the device
- **WHEN** a report is confirmed sent
- **THEN** the device SHALL retain its copy rather than delete it, consistent with the client-retention backstop the backup design relies on

### Requirement: The sync endpoint accepts reports under the existing authorization and validation discipline
The sync service SHALL expose a report-ingestion route that requires the same shared-token
authorization as its existing routes, SHALL validate every submitted report — kind, message
presence and bound, required context fields — before storing it, and SHALL reject a malformed report
without storing a partial record. A rejected report SHALL NOT prevent valid reports delivered in the
same batch from being stored, and the response SHALL count inserted, duplicate, and rejected reports.

#### Scenario: Unauthorized submission
- **WHEN** a report is submitted without a valid shared token
- **THEN** the request SHALL be rejected as unauthorized and nothing SHALL be stored

#### Scenario: Malformed report in a batch
- **WHEN** a batch contains a report with an unknown kind or an over-length message alongside valid reports
- **THEN** the malformed report SHALL be rejected and counted, and the valid reports SHALL be stored

#### Scenario: Same validation on both ends
- **WHEN** a report is judged valid by the device before it is stored locally
- **THEN** the sync service SHALL judge it valid by the same rules, so that a report accepted on the device is never rejected on receipt for a schema reason

### Requirement: Reports are exported and backed up with the learner record
Reports SHALL be included in the repo-side export as their own human-inspectable, version-controlled
file alongside the learner event and rating exports, SHALL be regenerated, committed, and pushed by
the same automated backup as those files, and SHALL be subject to the same protection that keeps
non-production data out of the canonical location.

#### Scenario: Export includes reports
- **WHEN** the export tool runs against the production store
- **THEN** the output SHALL include every stored report, one per line, in the same directory as the learner event export

#### Scenario: Automated backup commits new reports
- **WHEN** a report reaches the production store and the scheduled backup next runs
- **THEN** the report export SHALL be regenerated, committed, and pushed by that run
- **AND** a run in which only the report export changed SHALL be recorded as new data, not as "nothing new"

#### Scenario: Non-production reports never reach the canonical record
- **WHEN** the export tool runs against a non-production store without an explicit destination
- **THEN** it SHALL refuse exactly as it does for learner events, leaving the canonical report export unmodified

#### Scenario: Reading reports needs no additional tooling
- **WHEN** someone wants to read the reports filed so far
- **THEN** the committed export file SHALL be sufficient on its own, with each line a complete self-describing record

### Requirement: The report form never enters the child-facing activity
The report form, and every control that opens it, SHALL be rendered only on adult-facing screens.
No control that opens the report form and no text belonging to it SHALL be rendered within any
learner module or the closing beat of one, and the report form SHALL NOT be shown at the same time
as any learner activity.

#### Scenario: Activity tree is unaffected
- **WHEN** a learner is in any activity, including its closing beat
- **THEN** no report control or report text SHALL be present, and the activity's existing guarantee that no score-like or status-like text appears SHALL hold unchanged

#### Scenario: Form and activity are mutually exclusive
- **WHEN** the report form is shown
- **THEN** no learner activity SHALL be mounted at the same time
- **AND** leaving the form SHALL return to the application's normal cold-start entry

### Requirement: Free text renders regardless of the shipped font subset
The report form SHALL render the adult's typed text legibly in any script — including Chinese
characters that are outside the application's subsetted display font — and SHALL NOT require any
change to that font subset or to the application's own UI copy in order to do so.

#### Scenario: Chinese text in a report
- **WHEN** the adult types Chinese characters that are not part of the application's font subset
- **THEN** they SHALL render as real glyphs on screen, not as missing-glyph boxes

#### Scenario: UI copy set is unchanged
- **WHEN** this capability is present in a build
- **THEN** the set of characters the application's own UI copy requires of the font subset SHALL be unchanged from before the capability existed
