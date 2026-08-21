## Why

Production's static files, its nginx config, its compose file, and the only on-disk copy of its
sync shared token all live inside a single Claude Code session worktree
(`.claude/worktrees/bridge-cse_01WEvjnbbXmpPwEVch6z8aJi/`). That is scratch space, not a
deployment.

**This is not a hypothetical risk — it already fired.** The worktree production was *originally*
launched from (`bridge-cse_014e5YbP6LPCxeuz1SsuF4rA`) was deleted during the
`add-dev-deployment` session: gone from disk, unregistered from git. Nothing broke only because
that change's volume migration happened to copy `infra/sync-service/.env` forward a few hours
earlier. That was luck.

The failure it sets up is latent rather than immediate, which makes it worse: the running nginx
keeps serving from a directory that no longer exists, and the breakage surfaces on the next
container restart — a reboot, a Docker daemon upgrade, an unattended `docker compose up`. In
other words, at the least convenient possible moment, on the app a four-year-old uses.

The pattern that fixes this is already in the repo and already proved itself. `shizi-sync`
survived that same worktree deletion without anyone noticing, because it ships as a built image
and keeps its data in a named volume. `shizi-gateway` did not, and the *only* difference is that
it bind-mounts a working tree. `add-dev-deployment` pinned the compose project name and moved the
event-store volume to `shizi_events-data`, which fixed production's *identity*; it did not fix
what production *serves from*.

This matters now specifically because `bootstrap-shizi-assessment` Section 10 — the first real
session with Eliana — is the next milestone, and the sync endpoint went live for the first time
during the `add-dev-deployment` session. Real learner data starts accumulating from that session
onward. Hardening the deployment is much cheaper before that than after.

## What Changes

- **Production serves an immutable artifact instead of a working tree.** The gateway gets a real
  image that carries the built `apps/assessment/dist` and the nginx routing config, replacing the
  bind-mount to `apps/assessment/dist` in `docker-compose.yml`. Production then depends on no
  filesystem path inside any git checkout — the same property `shizi-sync` already has.
- **The dev/prod asymmetry becomes deliberate.** `docker-compose.dev.yml` keeps bind-mounting the
  working tree, because serving whatever tree is under verification is precisely dev's job. Today
  the two stacks are symmetric and that symmetry is the defect, not a feature.
- **Add a `.dockerignore`.** There is none, so the existing sync build ships an 82MB context. The
  gateway's actual payload is 788K. Without this, adding a second image build makes every deploy
  needlessly slow.
- **Deployment secrets move outside every git working tree.** `infra/sync-service/.env` (and the
  dev equivalent) move to a durable host location referenced by absolute path from compose, so a
  `git clean -xfd`, a branch switch, or a worktree deletion cannot destroy the shared token.
  Losing that token is not merely inconvenient: events already queued in the iPad's IndexedDB
  would fail authentication on every future sync attempt, which is real learner-data loss.
- **Make the incident class impossible rather than documented-against.** `add-dev-deployment`
  responded to an actual four-minute production outage (`rm -rf dist` + rebuild broke the running
  container's bind mount) by writing a warning into `infra/README.md`. An image removes the
  failure mode instead of asking a future reader to remember a rule — consistent with how this
  repo already handles guarantees it cares about (`EventLog` has no delete method; dev's sync
  service is unreachable from the shared network by construction; the environment badge's
  containment is a spec requirement rather than a review note).

Out of scope: any CD pipeline (`.github/workflows/ci.yml` still stops at `build`, deliberately —
deployment stays a manual act); a registry (images stay local to this host); changing what the
application does; and the two open device-verification tasks in `add-dev-deployment`.

## Capabilities

### New Capabilities
(none — this extends the existing `deployment` capability rather than introducing a new one.)

### Modified Capabilities
- `deployment`: strengthens the existing "Production identity is independent of the working copy"
  guarantee, which today covers only container and volume *naming*. It must also cover what
  production serves and where its credentials live: production must serve an immutable artifact
  that survives deletion of every checkout, and deployment secrets must outlive any working tree.
  Also needs to state the dev/prod bind-mount asymmetry as intended behavior, so a future reader
  does not "fix" the inconsistency by making them symmetric again.

## Impact

- **Modified**: `docker-compose.yml` (gateway becomes an image build; `env_file` points at the
  durable secrets path), `docker-compose.dev.yml` (same secrets path change; keeps its
  bind-mount), `infra/README.md` (deploy and rollback procedure, secrets location).
- **New**: a Dockerfile for the gateway, `.dockerignore`.
- **Operational, one-time**: move the existing `.env` to its durable location before anything
  recreates the sync container — its current copy is the only one on disk, though the running
  container still holds the value in its environment. The token should also be recorded somewhere
  durable off this machine (a password manager); nothing in this repo can or should hold it.
- **Deploy flow changes shape**: `npm run build` then an image build, rather than `npm run build`
  then a container restart. Slightly slower, and it means a routing-config change reaches
  production on redeploy rather than on restart.
- **Prerequisite, not part of this change**: the `add-dev-deployment` work is currently
  uncommitted in the same at-risk worktree. It should be committed and pushed before this change
  is implemented, since this change edits the same files.
- **No impact on the running application's behavior** — this is entirely about how the same build
  reaches production.
