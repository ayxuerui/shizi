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

### Cron, not `systemd --user`, following this host's own existing idiom

**Decision:** a plain crontab entry, not the `systemd --user` timer `automate-event-log-backup`
originally proposed — a direct instruction from the user, and it also happens to fit this host
better than the superseded design did. This host already runs `pkm-maintenance`'s
version-controlled crontab; a new `flock`-guarded, tagged entry in the same style is one more
line in an idiom that already exists here, rather than a second, parallel scheduling mechanism
(`systemd --user` units) that would need its own `enable-linger` step and its own conventions.
`enable-linger` was flagged in the superseded design as "easy to forget, fails silently" — cron
avoids that specific failure mode entirely, since the system cron daemon isn't tied to a login
session the way a `--user` unit is.

**What carries over unchanged from the superseded design:** the narrow-commit-scope guard
(refuse to run if the clone has unrelated uncommitted changes), the "prove it ran even when
there was nothing new" evidence requirement, and the durable, narrowly-scoped push credential —
none of that is scheduling-mechanism-specific, so none of it needed rethinking.

### Installation must never touch `pkm-maintenance`'s lines

**Decision:** install this job by reading the current crontab, filtering out only lines tagged
with this job's own identifying comment (idempotent re-install), and writing the result back —
never `crontab <full-file>` from a template that doesn't already contain every other job's
lines verbatim. The existing `pkm-maintenance` install script already demonstrates the safe
pattern (`crontab -l | grep -v '# <tag>'; <new lines> | crontab -`); this change's installer
follows the identical shape rather than a bespoke one.

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
  self-observable git-log property is the primary mitigation; the job must also source its own
  `.env` explicitly (cron's environment is otherwise near-empty — confirmed directly from this
  host's existing `pkm-maintenance` crontab comments making the same point), and must be tagged
  so its presence (and any output redirected to a log) is easy to find later.
- **Two durable-location directories (`~/.config/shizi/`, `~/.local/share/shizi/`) instead of
  one** → accepted; see "A second durable-location convention" above. Documented clearly in
  `infra/README.md` so it reads as a deliberate split, not drift.
- **Installing a crontab entry risks the host's other scheduled jobs if done carelessly** →
  mitigated by reusing the exact idempotent, tag-filtered install pattern this host's own
  `pkm-maintenance` setup already uses successfully, rather than inventing a new one.
