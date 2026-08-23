## Context

See proposal.md — Why. What constrains the approach:

- Docker here is **rootless** (`DockerRootDir: ~/.local/share/docker`); the `events-data` named
  volume's files are already owned by the invoking host user, not `root`. That removes the one
  concrete reason to prefer Docker-managed storage over a plain bind mount for this data — the
  usual host/container UID mismatch a bind mount can introduce simply doesn't apply here.
- `infra/sync-service/src/db.ts`'s three read queries carry explicit total orderings (`ORDER BY
  timestamp ASC, id ASC`; `row_id ASC`; `recorded_at ASC, session_id ASC`). An unchanged dataset
  re-exports byte-identically; new data only appends. Confirmed by reading the queries directly.
- `harden-prod-deployment` already established `~/.config/shizi/` for the shared token and
  published config, and already established the pattern for migrating live state safely (stop,
  copy, verify by checksum, swap, leave the original as rollback) — twice, once for the
  production compose-project volume rename, once fixing the `config.json` mount location live.
- This host already runs a version-controlled crontab for a separate project
  (`pkm-maintenance`): entries tagged with an identifying trailing comment, each wrapped in
  `flock -n <lockfile> -c '...'` against overlapping runs, secrets/PATH sourced from a `.env`
  file rather than inlined, installed idempotently (`crontab -l | grep -v '# <tag>'; ... |
  crontab -`, replacing only that job's own tagged lines). Confirmed directly by reading the
  live crontab. This change's own entry follows that idiom rather than inventing a new one, and
  must never disturb those existing, unrelated lines.
- `main` is unprotected and a git credential helper is already globally configured for
  interactive `gh` use — the same starting point `automate-event-log-backup` (now superseded)
  already established still holds.
- Confirmed directly: 0 events, 0 ratings, 0 assignments in the live store at time of writing.
  The migration this change requires is close to risk-free today.

## Goals / Non-Goals

**Goals:**
- The live event store is reachable at a fixed, memorable host path, with no container-runtime
  query needed to find it.
- Backups happen automatically, on a daily cadence, without a person remembering to run them.
- Installing the backup job cannot disturb the host's existing, unrelated crontab entries.
- Backup health is answerable by reading the repo's own history.

**Non-Goals:**
- Continuous/point-in-time replication (Litestream or similar) — daily-periodic matches this
  dataset's actual write rate; worth revisiting once periodic durability is proven.
- Moving `config.json` or the shared-token files out of `~/.config/shizi/` — already correctly
  placed by `harden-prod-deployment`; this change only adds a sibling location for a different
  *kind* of durable state.
- Alerting infrastructure beyond the self-observable git-log property.
- Resolving the iOS storage-eviction question (`bootstrap-shizi-assessment` task 2.6) — this
  change depends on client-side retention as a backstop and says so; it does not confirm that
  backstop's real limits.

## Decisions

### A second durable-location convention: `~/.local/share/shizi/` for data, `~/.config/shizi/` for config

**Decision:** the event store moves to `~/.local/share/shizi/sync-data/`, bind-mounted into the
sync container at `/repo/infra/sync-service/data`, replacing the `events-data` named volume.
`~/.config/shizi/` already holds small, largely hand-edited text (the shared token, the published
config) — loosely, XDG's "config" category. A multi-megabyte, ever-growing SQLite database plus
its own periodic snapshots is a different kind of thing — XDG's "data" category — and giving it
a sibling location under `~/.local/share/` rather than crowding it into `~/.config/` keeps the
distinction legible instead of accidental. Both directories share the same actual property that
matters (outside every git working tree, fixed and known in advance); the split is about what
kind of durable state each one holds, not about durability itself.

**Alternative rejected:** put everything under `~/.config/shizi/` for "one place to look."
Rejected because it would mix a slowly-growing set of hand-edited secrets with a
programmatically-written, ever-growing database and its own backup snapshots — the kind of
mixing that makes it harder to reason about what's safe to `chmod`, back up, or treat as
sensitive.

### Migrate now, while the risk is close to zero

**Decision:** perform the volume-to-bind-mount migration as part of this change rather than
deferring it, using the exact discipline already proven twice in this project (`add-dev-
deployment`'s compose-project volume rename; `harden-prod-deployment`'s `config.json` mount
fix): stop the sync container so SQLite checkpoints its WAL, copy the named volume's contents to
the new host path with a throwaway container, verify byte-for-byte with `md5sum` per file, point
`docker-compose.yml` at the new bind mount, bring the stack back up, and confirm event/rating/
assignment counts are unchanged. The original named volume is left in place, untouched, as the
rollback path.

Confirmed directly before writing this: the live store currently holds 0 events, 0 ratings, 0
assignments. This is therefore close to the cheapest this migration will ever be — exactly the
reasoning `add-dev-deployment` used to justify pinning the compose project name before real
session data existed. Waiting would only make a materially identical migration riskier for no
benefit.

### A cron daemon inside a container, not a host crontab entry

**Decision, revised mid-implementation at the user's explicit direction:** the daily schedule
runs inside a dedicated `backup-cron` container (`infra/backup-cron.Dockerfile`), not as an
entry in the host's own system crontab. The original plan — a `flock`-guarded, tagged line
alongside this host's existing `pkm-maintenance` crontab — was fully implemented and verified
(installer script, idempotent re-install, a real diff proving `pkm-maintenance`'s lines were
untouched) before being reverted in favor of this. The reasoning that changed it: this project's
other infrastructure (`gateway`, `sync`) is already entirely containerized, and a host crontab
entry is the one piece of it an operator would need host SSH access and `crontab -l` to inspect
or change, rather than ordinary Docker tooling (`docker exec shizi-backup-cron cat
/etc/cron.d/shizi-backup`, `docker logs shizi-backup-cron`) consistent with everything else.

**What carries over unchanged from the superseded (host-crontab, and before that, `systemd
--user`) designs:** the narrow-commit-scope guard, the "prove it ran even when there was
nothing new" evidence requirement, and the durable, narrowly-scoped push credential — none of
that is scheduling-mechanism-specific, so none of it needed rethinking across either pivot.

### The container reuses the real deploy clone; it does not maintain a second one

**Decision, confirmed directly with the user:** `backup-cron` bind-mounts the SAME
`~/deploy/shizi` the human release workflow already operates on (read-write — this is what
actually gets committed to and pushed), rather than cloning the repository a second time inside
the container. Also bind-mounted at the exact same absolute host paths the clone's own git
config and `pull-events.ts`'s fixed default already expect: the deploy key (so
`core.sshCommand` resolves with zero changes to that config) and the event store from section 1
(read-only — backup only reads it). No credentials or a second git history are baked into the
image.

The consequence accepted deliberately: `node_modules` isn't part of that clone by default (it's
never been needed there before this container), so the entrypoint runs `npm ci` into the
bind-mounted clone at container start if missing — a real, one-time cost on first boot (native
`better-sqlite3` compile, confirmed to take under a minute), not on every cron tick. The
alternative — baking `node_modules` into the image at build time — was rejected because it would
let the running script silently drift from whatever commit the clone is actually on; installing
into the bind mount at start keeps the code that runs always exactly matching that commit.

**Output visibility:** cron's own job output isn't forwarded to `docker logs` by default — it's
mailed (nowhere, here) or silently dropped. The crontab entry redirects explicitly to
`/proc/1/fd/1`/`/proc/1/fd/2` (the container's own PID 1, `cron -f`), a well-known pattern for
getting cron output into a container's log stream. Verified directly: a manually-triggered run
using that exact redirect showed up in `docker logs` immediately.

**Found and fixed while verifying this, not assumed:** the container has no git identity
configured (no `user.name`/`user.email`), which the FIRST live-triggered commit attempt caught
immediately (`git commit` refused with "Author identity unknown"). Fixed by setting it in the
deploy clone's own LOCAL git config on the host — persists via the bind-mounted `.git` directory,
no container-side setup needed, same treatment `core.sshCommand` already got.

### Deliberately not built

- **Dev's event store stays on a named volume.** Dev is meant to be trivially disposable
  (`docker compose down -v`); a fixed host path would need separate manual cleanup for data
  that's already documented as disposable by design. Stated as intended asymmetry, matching how
  `harden-prod-deployment` already stated the dist/config-mount asymmetry between the two
  stacks.
- **Litestream / continuous replication.** A reasonable future upgrade once daily-periodic
  durability is proven; not a prerequisite for it.
- **A retry/alerting layer around the cron job itself.** The self-observable git-log property is
  the monitoring. `flock`'s failure mode (a job that's still running when the next tick fires)
  is handled by skipping that tick, not queuing — acceptable at this data volume and cadence.

## Risks / Trade-offs

- **The migration touches the live event store** → mitigated by the proven stop/copy/verify/swap
  sequence and the untouched-original-as-rollback discipline; further de-risked by confirming
  the store is currently empty.
- **A cron job with no interactive session context can fail silently if misconfigured** → the
  self-observable git-log property is the primary mitigation. Fully isolated inside its own
  container now, so this risk no longer extends to the host's own scheduler at all.
- **Two durable-location directories (`~/.config/shizi/`, `~/.local/share/shizi/`) instead of
  one** → accepted; see "A second durable-location convention" above. Documented clearly in
  `infra/README.md` so it reads as a deliberate split, not drift.
- **A host crontab entry was implemented, verified, and then reverted within this same change**
  → not wasted effort worth hiding: the reversion happened cleanly (the installer script proved
  a byte-for-byte diff of only the added line before being deleted; the crontab was restored
  from a captured backup and re-verified identical), and the decision to containerize instead
  came from the user directly, after the host-crontab approach was already working. Recorded
  here, and in tasks.md's section 4 notes, rather than presented as though the container
  approach were the only one ever considered.
- **Verifying this created real commits on the actual production `main` branch** → accepted,
  deliberately: proving the backup mechanism works AT ALL requires a real push to the real
  remote — there's no meaningful way to fake that check. Both real triggered runs (one with new
  data, one without) are exactly the commits this mechanism is supposed to produce in normal
  operation, not test pollution to clean up afterward.
