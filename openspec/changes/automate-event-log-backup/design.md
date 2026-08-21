## Context

See proposal.md — Why. What constrains the approach:

- The export is deterministic and append-only: `infra/sync-service/src/db.ts`'s three read
  queries carry explicit total orderings (`ORDER BY timestamp ASC, id ASC`, `row_id ASC`,
  `recorded_at ASC, session_id ASC`). An unchanged dataset re-exports byte-identically; new data
  only appends. Confirmed by reading the queries directly, not assumed.
- `main` is currently unprotected (`GET .../branches/main/protection` → 404) and the `gh` CLI's
  credential helper is already wired globally (`credential.https://github.com.helper`), so direct
  pushes already work non-interactively today — for a *person* running an interactive session.
  That token is not the right credential for years of unattended automation (see Decisions).
- Docker here is rootless; named volumes live under `~/.local/share/docker/volumes/`, directly
  readable by the owning user with no `docker exec` needed. `EVENTS_DB_PATH` pointed at
  `docker volume inspect <volume> --format '{{.Mountpoint}}'` is the confirmed-working form;
  running the export via `docker exec` is confirmed broken (writes into the container's own
  layer, never reaching the host).
- `apps/assessment/src/offline/event-queue.ts`'s `markEventsSynced`/`markRatingsSynced` set
  `synced: true` and never delete. The iPad therefore already holds a third, independent copy of
  every event for the life of the install.
- `harden-prod-deployment` establishes a deploy clone at `~/deploy/shizi`, pinned to `main`, never
  developed in. This is the natural place to run the backup timer from, since it already carries
  the property (no branch churn, no worktree risk) this automation needs.

## Goals / Non-Goals

**Goals:**
- Backups happen without a person remembering to run them, and keep happening if a person is
  absent for an extended period.
- Whether the mechanism is currently healthy is answerable from the repo itself.
- The automation cannot corrupt or pollute the commit history by folding in unrelated state.

**Non-Goals:**
- Continuous / point-in-time replication. Daily-or-so periodic backup matches this dataset's
  actual write rate (a few sessions a week); a continuous mechanism (e.g. Litestream) is a
  reasonable future upgrade once periodic durability is proven, not a prerequisite for it.
- Alerting infrastructure. The self-observable git-log property is the monitoring; anything more
  is optional and explicitly deferred.
- Confirming the iOS storage-eviction backstop. That is task 2.6's open spike, genuinely blocked
  on multi-day real-world observation. This change depends on that backstop's existence and says
  so; it does not resolve the open question about its limits.

## Decisions

### Hosted database rejected; git remains the backup target

**Decision:** keep `data/events/events.jsonl` in git as the canonical durable record, exactly as
already designed, and fix only the fact that nothing produces or pushes it. Considered and
rejected: migrating the event store to a free-tier hosted database with a managed backup feature.

Two reasons, both concrete rather than a general preference: first, several free hosted-DB tiers
pause or reclaim inactive projects on the order of a week, and this app is used by a young child
a few times a week — a backup mechanism that sleeps when the family doesn't play is worse than
the mechanism that exists today. (Tier terms change; this is a category risk to check against
current terms if reconsidered, not a permanent fact.) Second, and more basic: the dataset is
~1MB/year of append-only rows. Git already gives versioning, off-machine replication, and
integrity checking for that size for free, and gives something a hosted DB does not — a
human-legible, `git log -p`-able history of the child's own learning record.

If Cloudflare D1 is ever wanted for a different reason (the account exists; only `wrangler`
authentication was ever actually missing — see `bootstrap-shizi-assessment`'s design.md), D1's
Time Travel feature is the right tool for point-in-time recovery. Not adopted here since backup
alone doesn't justify the migration.

### A dedicated fine-grained credential, not the interactive `gh` login

**Decision:** create a fine-grained GitHub PAT (or a deploy key) scoped to `contents:write` on
this repository only, and configure the timer to push with it directly — not through the
account-wide `gh auth` credential helper already active on this machine.

The existing helper works today only because a person is logged in with `gh`. Tying years of
unattended pushes to that same login means a future `gh auth logout`, a token expiry, or a
credential rotation done for an unrelated reason silently stops backups — precisely the kind of
failure the self-observable git-log property (below) exists to catch, but only if someone
actually checks. A credential scoped to exactly this purpose fails in a smaller, more legible way
and isn't entangled with the operator's day-to-day GitHub use.

### Self-observable health over a dashboard

**Decision:** no monitoring service, no alert. The property that makes this acceptable: because
the export is append-only and deterministic, `git log -1 --format=%cr -- data/events/` answers
"is this working" directly, and a run that finds nothing new still needs to prove it ran (see the
spec's "distinguishable from silence" requirement) — satisfied by having the automation touch a
lightweight marker (e.g. an empty commit, or a run-log file) on a true no-op, so a stalled timer
and a quiet week are never confused by looking at the same evidence.

**Alternative rejected:** a healthcheck ping to an external uptime service. More moving parts, a
new account/credential to manage, and a failure mode of its own (the pinger silently stops
pinging) — not worth it for a check that's already answerable by looking at the actual data.

### Runs from wherever production actually deploys from

**Decision:** the timer runs from `harden-prod-deployment`'s deploy clone once it exists, since
that location already satisfies "pinned to `main`, never developed in" — exactly the property
this automation also needs, so there is nothing new to build for it. Until that change lands,
this one can run from whatever checkout currently operates production; the unit file's working
directory is a one-line change to update later, not a redesign.

### Narrow commit scope, enforced by the automation itself, not by convention

**Decision:** the script explicitly checks for uncommitted changes outside `data/events/` before
touching git at all, and aborts rather than proceeding. An unattended process that runs `git add
-A` by habit is a real way to accidentally ship a stray local edit to `main` with no review gate
in front of it (recall: `main` has no branch protection). Scoping the `git add` and pre-checking
clean-ness turns "don't do that" from a convention into something the script itself enforces.

## Risks / Trade-offs

- **A stalled timer looks like a quiet week** → mitigated by the "distinguishable from silence"
  requirement above; the automation must leave evidence it ran even when there was nothing new to
  export.
- **The fine-grained PAT itself needs to be stored somewhere durable** → same class of problem
  `harden-prod-deployment` already solved for the sync token: outside every git working tree, with
  a second copy in a password manager. Reuse that location rather than inventing a second one.
- **`main` has no protection, so a buggy automation could push something wrong with no review** →
  accepted, bounded by the narrow-commit-scope decision above: the worst case is a bad export of
  append-only, low-sensitivity data, not an arbitrary bad push, and it's trivially revertable.
- **This change assumes a deploy clone that doesn't exist until `harden-prod-deployment` ships** →
  not a hard dependency (see Decisions), but implementing this first means retargeting the unit's
  working directory later. Sequencing after `harden-prod-deployment` is the smoother path.
- **`enable-linger` is easy to forget and fails silently** → the timer simply never fires when
  nobody is logged in, with no error anywhere. Task list calls this out as its own explicit,
  verified step rather than an assumed side effect of installing the unit.
