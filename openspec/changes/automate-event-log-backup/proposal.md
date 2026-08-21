## Why

The durable backup for this project's event log is a habit, not a mechanism: run
`pull-events.ts`, commit `data/events/*.jsonl`, push. Nobody has ever done it. `data/events/`
does not exist on disk, and the invocation `bootstrap-shizi-assessment`'s own task notes describe
running it against (`docker exec <container> npx tsx scripts/pull-events.ts`) writes into that
container's ephemeral layer, not the repo — confirmed directly while implementing
`add-dev-deployment`. So the backup plan this repo has documented has never once produced the
file it exists to produce.

This matters now specifically because the sync endpoint went live for the first time during the
`add-dev-deployment` session, and `bootstrap-shizi-assessment` Section 10 — the first real session
with Eliana — is the next milestone. Real, non-recoverable learner data starts accumulating from
that point on.

The dataset itself argues strongly for the existing plan over anything heavier: the export is
byte-stable for unchanged data (deterministic `ORDER BY` on every table) and strictly
append-only, so every backup commit is a pure append with no churn — confirmed directly against
`infra/sync-service/src/db.ts`. At roughly 200 bytes/event and a few sessions a week, the whole
history grows by low single-digit MB per year. Git, already the project's system of record for
everything else, is not merely adequate for this — it is a better fit than a hosted database
would be: versioned, integrity-checked by content hash, replicated for free by every `git push`,
and legible with `cat` and `git log -p` rather than requiring a client to query. A hosted DB with
a backup add-on was considered and rejected for this reason — see design.md.

What's missing is not a technology. It's a scheduled runner, a push credential that survives
longer than a login session, and a way to notice if either stops working.

## What Changes

- **A scheduled `pull-events.ts` → commit → push loop**, run as a `systemd --user` timer from the
  deploy clone this change assumes `harden-prod-deployment` establishes (or, until that lands,
  from whatever checkout currently runs production).
- **Reads the SQLite file directly from its host volume mountpoint**, not via `docker exec` —
  the invocation that's actually broken (writes into the container's own layer, never reaching
  the repo). `EVENTS_DB_PATH` pointed at `docker volume inspect ... --format '{{.Mountpoint}}'`
  is the confirmed-working form.
- **Commits narrowly.** The automation stages and commits only `data/events/*.jsonl`, and refuses
  to run if the clone has other uncommitted changes — an automated process must never silently
  fold unrelated local state into a commit.
- **A durable push credential.** The `gh` CLI's currently-wired credential helper uses a
  personal OAuth token tied to an interactive login; that is not the right credential for a timer
  meant to run unattended for years. A fine-grained PAT (or deploy key) scoped to this repo alone
  replaces it for this specific automation.
- **Self-observable health, deliberately with no new infrastructure.** Because every commit is a
  real append, "when did the backup last succeed" is answerable with `git log -1 -- data/events/`
  — no dashboard, no alerting service, nothing else to maintain or that can itself silently fail.
- **`enable-linger` for the running user**, so the timer fires when nobody is logged in — the kind
  of prerequisite that's easy to omit and silently disables the whole thing.
- **Explicit acknowledgment of the third copy that already exists.** `markEventsSynced` sets
  `synced: true` rather than deleting; the iPad's IndexedDB retains every event indefinitely. That
  is currently the only thing standing between a broken host timer and real data loss, which
  makes task 2.6's open storage-eviction spike directly load-bearing for how much this backup
  mechanism is trusted, not just a device curiosity.

Out of scope: point-in-time / continuous replication (e.g. Litestream) — worth a future
comparison once daily-periodic durability is actually in place, not before; hosted database
migration (rejected — see design.md); alerting beyond the self-observable git-log property;
changing `pull-events.ts`'s own export logic (already correct; `add-dev-deployment` already added
its dev/prod output-directory guard).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `deployment`: adds the requirement that the canonical learner record is durably, automatically,
  and observably backed up off-machine — a gap the capability's existing scope (environment
  isolation, credential survival, artifact immutability) does not cover. Also states the
  IndexedDB-retains-everything property as a documented, relied-upon fact rather than an
  incidental implementation detail, since this change's design leans on it.

## Impact

- **New**: a small backup script (or a thin wrapper around `pull-events.ts` adding the git steps),
  a `systemd --user` service + timer unit, `infra/README.md` documentation of the setup
  (including `enable-linger`) and the credential-rotation procedure.
- **Operational, one-time**: create the fine-grained PAT (or deploy key) and configure it as the
  push credential for the deploy clone specifically — not the interactive `gh` login used
  elsewhere on this machine.
- **Sequencing**: most naturally runs from `harden-prod-deployment`'s deploy clone once that
  exists, so this change is easiest to implement after that one lands; it does not strictly
  require it and can target the current production checkout in the interim.
- **No impact on the running application** — this is entirely about what happens to data after
  it's already durably in the sync service's own SQLite store.
