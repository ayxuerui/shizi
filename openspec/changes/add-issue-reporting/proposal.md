## Why

The only people who see this app misbehave are the parent sitting next to the child on an iPad —
usually in standalone mode, often offline, with no devtools and no address bar. Today the only way
that observation reaches the person who can fix it is memory: "the audio didn't play for one of the
characters yesterday, I think" — by which point the build, the session, and the character are all
gone. The same goes for ideas ("she keeps wanting to trace the character again after the bout"):
there is no place to put them down at the moment they occur. The app already has a durable,
offline-first, idempotent path from the device to this repo for learner events and parent ratings;
this change puts bug reports and feature requests on that same path, so a note written on the iPad
lands in git with the build id and session it came from attached.

## What Changes

- **A parent-facing report form inside the app.** A new, English/ASCII-only screen where the
  accompanying adult picks a kind (something went wrong / an idea), types a free-text message, and
  saves it. Reached from the existing diagnostics screen (itself reachable from the unlock screen's
  corner long-press, which already works in standalone mode) and, for desk/remote-browser testing,
  from a `#report` URL fragment alongside the existing `#diagnostics` one. Never rendered inside the
  child-facing activity tree — same either/or containment as the diagnostics screen.
- **Automatic context on every report.** Each report carries the environment it came from (prod/dev),
  the build id, the user agent, whether the app is installed to the home screen, whether it was online
  when written, and the most recent session id and activity recorded on that device — the things a
  parent cannot be expected to type and a developer cannot reconstruct afterwards.
- **Reports ride the existing sync pipeline end to end.** Saved to the device's local outbox first
  (so writing one works with no connectivity), flushed opportunistically to a new `/issue-reports`
  route on the self-hosted sync service under the same shared-token auth, stored idempotently in the
  same SQLite store, exported by the same `pull-events.ts` into `data/events/issue-reports.jsonl`, and
  committed nightly by the same `backup-cron` job. Reading reports is `cat`/`jq` on a committed file;
  no dashboard, no new service, no new credential.
- **A build id in every build.** Production and dev builds gain a `VITE_BUILD_ID` (short git SHA),
  supplied as a build argument by the release procedure — needed so a report can say which build
  produced the behavior.
- **A shared report schema and validator** (`@shizi/issue-reports`), used by the client on write and
  read and by the server on receipt, so the allowed kinds and size bounds cannot drift between them —
  the same discipline `validateSessionRating` already establishes.
- **Not a breaking change.** The IndexedDB schema bump is purely additive (a new object store; every
  existing store and row is preserved, per the deployment spec's client-retention backstop). The SQLite
  schema gains one table via `CREATE TABLE IF NOT EXISTS`. No existing route, event field, or UI copy
  changes. `copy.ts` is untouched, so no font-subset rebuild is needed.

## Capabilities

### New Capabilities

- `issue-reporting`: lets the accompanying adult file a bug report or feature request from inside the
  app and guarantees it reaches the project's durable, version-controlled record — what a report must
  contain, how it behaves offline, how it is kept out of the child-facing activity, how it is
  transported and deduplicated, and how it is exported and backed up alongside the learner record.
  Behavioral requirements only; the route, table, and screen wiring are design.md's concern.

### Modified Capabilities

(none — the `deployment` spec's backup requirements are written in terms of "the canonical export
files" and already cover a new export file without a wording change; `pull-events.ts`'s
non-production guard applies to the new file by construction because it is the same function. The
`assessment` spec's "No visible scoring or failure state" guarantee is preserved rather than modified:
the new screen is never mounted alongside the activity tree.)

## Impact

- **New package**: `packages/issue-reports` (`@shizi/issue-reports`) — types, kind enum, size
  bounds, validator, plus a test file. Registered in the root `tsconfig.json` references and depended
  on by `apps/assessment` and `infra/sync-service`.
- **Sync service** (`infra/sync-service`): `src/db.ts` gains an `issue_reports` table and two store
  methods; `src/handle-sync.ts` gains `handleIssueReportsSync`; `src/server.ts` registers
  `/issue-reports`. `scripts/pull-events.ts` also writes `issue-reports.jsonl`;
  `scripts/backup-and-push.ts` stages, diff-checks, and logs it alongside the two existing exports.
  Tests extended for each.
- **App** (`apps/assessment`): new `src/issues/` (screen, context collector, tests);
  `src/offline/db.ts` (DB version 3 → 4, new `issueReports` store), `src/offline/event-queue.ts` and
  `src/offline/sync.ts` (enqueue/list/mark + a fourth flush leg); `src/diagnostics/entry.ts` (a
  second recognized fragment); `src/diagnostics/DiagnosticsScreen.tsx` (an opt-in "report" button);
  `src/App.tsx` (either/or routing between two parent screens instead of one); `vite.config.ts`
  (`VITE_BUILD_ID` define).
- **Build/deploy**: `infra/gateway.Dockerfile` and `docker-compose.yml` pass `VITE_BUILD_ID` through
  as a build arg (`.git/` is excluded from the Docker build context, so the SHA cannot be read inside
  the image); `infra/README.md`'s release procedure exports it. No new container, port, volume,
  hostname, or credential. The nginx template is untouched: `/assessment/sync/` already proxies every
  sub-path to the sync service.
- **Data**: `data/events/issue-reports.jsonl` becomes a third canonical export file, committed by
  `backup-cron`; `data/README.md` and `infra/README.md` document it and how to read it.
- **Explicitly untouched**: `copy.ts` (no Chinese UI copy is added — the form's own labels are
  English/ASCII like the diagnostics screen, and free text typed by the parent renders in a system
  font, not the subset font), every file under `src/bout/`, `src/exposure/`, `src/memory/`,
  `src/closing/`, `src/session/`, `styles/tokens.css`, the nginx template, and every existing spec.
- **Out of scope** (see design.md's Non-Goals): an in-session entry point on the closing beat,
  screenshots or attachments, a GitHub Issues bridge, and any notion of "resolved" state on a report.
