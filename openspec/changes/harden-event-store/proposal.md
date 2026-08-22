## Why

Production's event store — the SQLite database every real session actually writes to — lives in
a Docker-managed named volume (`shizi_events-data`), not a plain, known host path. That was the
right call for surviving container recreation, and it already has the property
`harden-prod-deployment` spent an entire change chasing: it never depended on any git checkout,
so it was never at risk from the worktree deletion or the `config.json` incident that change
found and fixed.

But it has a real, separate cost: nothing on the host can read or back up that file without first
resolving where Docker actually put it (`docker volume inspect ... --format '{{.Mountpoint}}'`).
`infra/README.md` already documents this as an explicit extra step, precisely because it's easy
to get wrong — and now that Docker on this host is confirmed rootless (the volume's files are
already owned by the invoking user, not `root`), the one reason to prefer Docker-managed storage
over a plain bind mount — avoiding a host/container UID mismatch — doesn't apply here. There's no
remaining reason not to put it at a fixed, memorable path.

Separately, the actual backup mechanism this project has always intended — export the event log
to `data/events/*.jsonl`, commit it, push — has never once run for real. `data/events/` doesn't
exist on disk. `bootstrap-shizi-assessment`'s own task notes describe running the export via
`docker exec`, which — confirmed directly while implementing `add-dev-deployment` — writes into
the sync container's own ephemeral layer and never reaches the repo at all. This change makes the
export automatic (a daily cron job, not a manual habit) and, by fixing the SQLite location first,
removes the `docker volume inspect` indirection from that job entirely — it can just read a fixed
path.

This supersedes `automate-event-log-backup` (proposed earlier, never implemented, 0 tasks
started), which designed the same backup goal around a `systemd --user` timer. Per the user's
explicit direction, this change uses a cron job instead — and this host already runs a
version-controlled crontab for an unrelated project (`pkm-maintenance`), with an established,
proven idiom (`flock`-guarded entries, tagged with an identifying comment, installed
idempotently without disturbing other jobs' lines, secrets sourced from a `.env` rather than
inlined). This change's own cron entry follows that same idiom rather than inventing a new one.

No real learner data exists yet (confirmed directly: 0 events, 0 ratings, 0 assignments in the
live store at time of writing), which makes this the cheapest possible moment to relocate the
event store — exactly the same reasoning `add-dev-deployment` used to justify pinning production's
compose project name before Section 10's first real session.

## What Changes

- **SQLite moves from a Docker-managed named volume to a fixed host bind mount** —
  `~/.local/share/shizi/sync-data/`, bind-mounted into the sync container at
  `/repo/infra/sync-service/data`, replacing the `events-data` volume. A new, deliberate
  convention: `~/.config/shizi/` stays config/secrets (small, hand-edited text: tokens,
  published config); `~/.local/share/shizi/` is durable application *data* (the growing event
  database and its own periodic snapshots). The existing named volume is left in place,
  untouched, as the rollback path — the same discipline `add-dev-deployment`'s volume rename
  and `harden-prod-deployment`'s config-mount fix both already followed.
- **A daily cron job** runs the event export (`pull-events.ts`, now pointed at the fixed host
  path directly — no more `docker volume inspect` step) and, only if the export actually
  changed, commits `data/events/*.jsonl` and pushes to `origin/main`. Installed as a
  `flock`-guarded, tagged entry alongside this host's existing `pkm-maintenance` crontab,
  installed idempotently so it never disturbs those unrelated jobs.
- **A durable, narrowly-scoped push credential** for the cron job, independent of any
  interactive `gh auth` login — the same reasoning `harden-prod-deployment` already applied to
  the sync shared token: an unattended job spanning years shouldn't be tied to someone's
  personal session.
- **Backup health stays self-observable**: because the export is byte-stable for unchanged data
  and strictly append-only (confirmed directly against `infra/sync-service/src/db.ts`'s
  deterministic `ORDER BY` clauses on every table), the timestamp of the last export commit is
  itself the health check — no dashboard, no alerting service to separately maintain.
- **Dev's event store is explicitly NOT touched.** `docker-compose.dev.yml`'s `dev-events-data`
  stays a named volume — dev is meant to be trivially disposable (`docker compose down -v`),
  and its data is already documented as disposable by design; moving it to a host path would
  add cleanup burden for no benefit. Stated as a deliberate asymmetry, matching how
  `harden-prod-deployment` already stated the dist/config-mount asymmetry between the two
  stacks.
- **`automate-event-log-backup` is removed**, replaced by this change. It proposed the same
  backup goal, unimplemented, around a different scheduling mechanism than what's actually
  wanted.

Out of scope: continuous/point-in-time replication (e.g. Litestream) — worth a future comparison
once daily-periodic durability is proven, not before; moving `config.json`/secrets out of
`~/.config/shizi/` (already correctly placed, not part of this change's problem); alerting
beyond the self-observable git-log property; confirming the iOS storage-eviction backstop
(`bootstrap-shizi-assessment` task 2.6, genuinely blocked on multi-day device observation).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deployment`: adds that the canonical event store lives at a fixed, host-discoverable location
  independent of Docker's own volume-naming internals, and that the canonical learner record is
  backed up automatically, off-machine, and observably — carrying forward (with the scheduling
  mechanism corrected to a cron job) the backup requirements originally proposed in the now-removed
  `automate-event-log-backup`.

## Impact

- **Modified**: `docker-compose.yml` (`sync`'s volume becomes a bind mount), `infra/README.md`
  (new host-path convention, migration record, backup/cron documentation),
  `infra/sync-service/scripts/pull-events.ts` (default `EVENTS_DB_PATH` resolution simplifies
  once the path is fixed — no behavior change, just removes the need for the `docker volume
  inspect` step in normal operation).
- **New**: a small backup script (or a thin wrapper around `pull-events.ts`) handling the
  git add/commit/push steps; a crontab entry.
- **Operational, one-time**: migrate the live `events-data` volume's contents to the new host
  path (near-zero risk today — confirmed 0 events/ratings/assignments — but done with the same
  stop-copy-verify-swap discipline as every prior migration this project has done, since this
  won't stay true after real sessions start); create the durable push credential; install the
  cron entry without disturbing the host's existing `pkm-maintenance` crontab.
- **No impact on the running application's behavior** — entirely about where data lives on the
  host and how it gets backed up.
