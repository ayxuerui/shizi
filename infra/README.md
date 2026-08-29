# infra

Self-hosted infrastructure for `bootstrap-shizi-assessment` Section 9 — static PWA hosting and the
sync endpoint + event store. **Not Cloudflare Pages/Worker/D1** (the original plan): `wrangler`
isn't authenticated in this project's dev environment, and there's no Cloudflare account to
provision against. This runs on your own machine instead, using the same pattern already proven by
the `spikes` service in the repo root's `docker-compose.yml` — Docker Compose + the existing
`cloudflared` tunnel to a Cloudflare Zero Trust hostname. Cloudflare's role shrinks to "tunnel only."

See `openspec/changes/bootstrap-shizi-assessment/design.md`'s "Cloudflare Pages/Worker/D1 →
self-hosted" decision entry for the full reasoning, including the SQLite backup plan.

## What's here

- `sync-service/` — the sync endpoint (tasks 9.2/9.3) + event store. A small Node/TypeScript
  service (no Express — one real route each doesn't need a router), backed by SQLite via
  `better-sqlite3` (the same engine Cloudflare D1 itself uses). Runs via `tsx` directly, no compile
  step — see its own request-handling logic in `src/handle-sync.ts`, deliberately written with no
  Node `http` types in its signature, so a future move to a real Cloudflare Worker (if your
  situation changes) would only need a thin adapter, not a rewrite.
  - `scripts/pull-events.ts` (task 9.5) — the **actual durable backup**: reads the live SQLite store
    directly and regenerates `data/events/events.jsonl` at the repo root. Commit that file after
    running this — every git remote/clone is then a full off-machine copy. Run manually or on
    whatever schedule you like.
  - `scripts/publish-config.ts` (task 9.4) — reads `data/events/events.jsonl`, computes the
    learner's known-set and a ranked next-teaching-target list (for a *future* consumer like
    `printed-reader` — the assessment app itself doesn't need these, see the script's own header
    comment), and publishes the probe pool + difficulty params to
    `apps/assessment/public/config.json`, which `apps/assessment` fetches at startup (falling back
    to its own bundled pool if that fetch fails or the file doesn't exist yet).
- `nginx-assessment.conf.template` — the routing rules for **both** deployments (task 9.1,
  extended by add-dev-deployment): serves the built `apps/assessment/dist` under a
  `/assessment/` path prefix, same pattern as `spikes/nginx-default.conf` plus a
  `Cache-Control: no-cache` rule on `sw.js` (a cached service-worker file would permanently
  block PWA updates from reaching the device), reverse-proxies `/assessment/sync/*` to a sync
  service, and redirects the bare domain root to `/assessment/`. A TEMPLATE, not a finished
  config: both `docker-compose.yml`'s `gateway` and `docker-compose.dev.yml`'s `gateway-dev`
  mount the same file at `/etc/nginx/templates/default.conf.template`, where the stock
  `nginx:alpine` entrypoint runs `envsubst` over it at container start. The only thing that
  differs between the two is each service's `SYNC_UPSTREAM` env var (`sync` in prod, `sync-dev`
  in dev) — everything else is one shared source of truth, so a routing rule can't be present in
  one environment and silently absent from the other. Both compose files also set
  `NGINX_ENVSUBST_FILTER` to match only `SYNC_UPSTREAM`, so `envsubst` doesn't touch nginx's own
  `$host`/`$scheme`/`$proxy_add_x_forwarded_for`, which share the same `${...}` syntax. Verify
  what actually rendered with `docker exec <gateway-container> cat
  /etc/nginx/conf.d/default.conf`.

## Domain reuse: shizi.realxco.com

`shizi.realxco.com` is already tunneled (Cloudflare Zero Trust) and currently points at `spikes`.
Rather than provisioning a second hostname for the real app, this reuses it: the Zero Trust
dashboard's target service gets repointed from `spikes` to `gateway` (container name
`shizi-gateway`), whose nginx reverse-proxies `/assessment/sync/*` internally to the `sync`
container — so the app and its sync endpoint are **same-origin** (no CORS to configure, and
`apps/assessment/.env`'s `VITE_SYNC_ENDPOINT` is just the relative path `/assessment/sync`, not a
second domain). `spikes` keeps running for local-only access (`http://localhost:8080`) — it's just
no longer what the public hostname resolves to.

**Single holding service, path-based routing:** the app is served at `shizi.realxco.com/assessment/`
rather than the domain root — a deliberate choice, at the user's request, so the `gateway` container
(named `shizi-gateway`, not `shizi-assessment`, precisely because it isn't just the assessment app's
container — it's the one thing the Cloudflare Tunnel ever needs to point at) stays the *only* target
to manage. A future second app would get its own path prefix on this same container (e.g. `/reader/`)
rather than a second tunnel target/hostname. This is why `apps/assessment/vite.config.ts` sets
`base: "/assessment/"` — every asset reference, the PWA manifest, and the service worker's
registration scope are built against that prefix, and `nginx-assessment.conf.template` uses
`alias` (not `root`) in its location blocks to strip the prefix before looking files up on disk.
Visiting the bare domain (`/`) 302-redirects to `/assessment/` for convenience.

## Production identity: `name: shizi`

Production's compose project is pinned with a top-level `name: shizi` in `docker-compose.yml`
(add-dev-deployment), rather than left to default to whatever directory `docker compose` was run
from. Before this, the live stack had been launched from a git worktree, so its unqualified
volume (`events-data`) resolved to a name derived from that worktree's directory — fragile,
since a worktree is expected to eventually be deleted. `container_name` was already fixed for
every service, but the project name (and therefore the volume) was not.

A one-time migration moved the live event-store volume to the now-stable name
(`shizi_events-data`): stop the stack (`docker compose down` — this checkpoints SQLite's WAL),
`docker volume create shizi_events-data`, copy the old volume's contents in with a throwaway
container (verify with `md5sum` per file, not just a listing), then bring the stack back up.
**Rollback:** the original volume is left in place, untouched, specifically so this is
reversible — nothing about the migration deletes it. See
`openspec/changes/add-dev-deployment/design.md`'s "Migration Plan" for the exact commands, and
its "Pinning `name: shizi` now" decision entry for why this was done before any real learner
data exists rather than deferred.

## Credentials: `~/.config/shizi/`

(`harden-prod-deployment`.) `SYNC_SHARED_TOKEN`/`VITE_SYNC_TOKEN` — one shared token, not two
independent secrets — live in `~/.config/shizi/prod.env` (dev: `~/.config/shizi/dev.env`),
**outside every git working tree**. Before this, the only on-disk copy was inside whatever
checkout happened to be running production; a `git clean -xfd`, a branch switch, or a worktree
deletion could destroy it. Create it once:

```
mkdir -p ~/.config/shizi && chmod 700 ~/.config/shizi
cat > ~/.config/shizi/prod.env <<EOF
SYNC_SHARED_TOKEN=$(openssl rand -hex 32)
VITE_SYNC_TOKEN=<same value as SYNC_SHARED_TOKEN above>
EOF
chmod 600 ~/.config/shizi/prod.env
```

Also record this value somewhere durable and off this machine (a password manager) — nothing in
this repo should be its only copy. This file is used two ways: `docker-compose.yml`'s `sync`
service reads it directly via `env_file:`; the release procedure below `source`s it so
`VITE_SYNC_TOKEN` is available as a shell variable for the gateway image's build arg (a build arg
comes from the invoking shell's environment, not a container's `env_file`).

**Rotating the token** is a two-step operation, not a single edit: change both lines in this
file, **then release a new gateway build** against the new value (see "Releasing a new version"
below) — the served app has the old value baked in until you do. Any client holding events
queued from before the rotation will get `401`s on every sync attempt until it receives a build
built against the new token. There is no way around this coupling; it's the cost of a shared
token rather than per-client credentials, accepted at this project's scale (see
`bootstrap-shizi-assessment`'s design.md).

**Published learner config lives here too** (`~/.config/shizi/config.json`), for the same reason:
it must survive the deploy clone disappearing. **Found the hard way, not anticipated up front:**
this file originally lived inside the deploy clone, and deleting that clone (task 6.4's own
verification) left the gateway container unable to even *start* on the next restart — a bind
mount whose source directory is gone isn't a "missing file" the app's fallback can help with; the
container itself fails. Fixed by moving it here (see
`openspec/changes/harden-prod-deployment/design.md`'s "Immutable app, mutable config" entry for
the full account). Publish to it explicitly:

```
mkdir -p ~/.config/shizi && touch ~/.config/shizi/config.json && chmod 644 ~/.config/shizi/config.json
npx tsx scripts/publish-config.ts --out ~/.config/shizi/config.json    # from infra/sync-service/
```

Not a secret — `chmod 644` (world-readable) is correct here, unlike `prod.env`/`dev.env` above.
The `touch` step matters even before the first real publish: Docker creates an empty *directory*
at a bind-mount path that doesn't exist yet, not a missing file, which is not what either side
expects.

## Releasing a new version

From the deploy clone (`~/deploy/shizi` — see "Where production runs from" below), never from a
Claude Code session worktree or any other throwaway checkout:

```
cd ~/deploy/shizi
git pull
set -a; source ~/.config/shizi/prod.env; set +a
docker compose build gateway sync backup-cron
docker tag shizi-gateway:latest shizi-gateway:$(date +%F)
docker compose up -d gateway sync backup-cron
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/assessment/   # expect 200
```

`backup-cron` doesn't need `VITE_SYNC_TOKEN` (it isn't in that build's `args:`), so it's harmless
to include even though `prod.env` was sourced mainly for the gateway build above.

**Rolling back** to the previous release:

```
docker tag shizi-gateway:<previous-date> shizi-gateway:latest
docker compose up -d --no-build gateway
```

**Production no longer depends on `rm -rf apps/assessment/dist` being safe** — the old
bind-mount hazard doesn't apply once `gateway` serves a built image; deleting `dist/` in the
deploy clone (or the deploy clone itself) does not affect the running container until you choose
to release again. That hazard is now specific to the **dev** stack, which still bind-mounts a
working tree on purpose — see "Dev environment" below, and don't `rm -rf` its `dist/` in place
while `gateway-dev` is running without also `docker restart`ing it afterward.

## Dev environment: `shizi-dev.realxco.com`

A second, isolated deployment (add-dev-deployment) for verifying a candidate build — especially
the device-only checks (add-to-home-screen, offline cold start, zh-CN `SpeechSynthesis`, Apple
Pencil palm rejection) that can't be done any other way — without touching the app the child
actually uses. See `openspec/changes/add-dev-deployment/` for the full spec/design; this is the
day-to-day operating summary.

**Setup**, from whatever checkout/worktree holds the build you're verifying:

1. Copy `sync-service/.env.dev.example` to `sync-service/.env.dev` and set a **separate**
   `SYNC_SHARED_TOKEN` — not the same value as production's `sync-service/.env`. A leaked dev
   token must not open production, and vice versa.
2. Copy `apps/assessment/.env.dev.example` to `apps/assessment/.env.dev`; set `VITE_SYNC_TOKEN`
   to match step 1.
3. Build with the dev flag: `(cd apps/assessment && npx vite build --mode dev && node
   scripts/check-precache.mjs)`. This is
   what makes the build identifiable on-device — the PWA installs as "shizi dev" instead of
   "shizi", and the unlock/diagnostics screens show a small `DEV` marker (never inside the bout
   itself). A build without `--mode dev` is indistinguishable from production once installed.
   Note: `npm run build --workspace=apps/assessment -- --mode dev` does NOT work — npm appends
   the flag to the end of the whole `&&`-chained script, where vite never sees it, and the
   build ships with production identity.
4. `docker compose -f docker-compose.dev.yml up -d --build` from the repo root.
5. **Your own action, outside this repo, once only:** add a `shizi-dev.realxco.com` public
   hostname in the Cloudflare Zero Trust dashboard targeting `http://shizi-gateway-dev:80`.

**One dev stack at a time.** `container_name` is hardcoded (so the Zero Trust entry has a stable
target) — a second `docker compose -f docker-compose.dev.yml up` from a different
checkout/worktree fails loudly on the name conflict rather than silently stealing traffic. Tear
this stack down (`docker compose -f docker-compose.dev.yml down`) before verifying a different
checkout.

**Operating model:** production builds from the main checkout; dev builds from whichever
worktree holds the candidate change. Since `npm run build` always writes to that checkout's own
`apps/assessment/dist`, the two never collide on disk as long as you don't build a dev artifact
from the same checkout that's serving production.

**Dev's data is disposable.** Its own token, its own SQLite volume (`dev-events-data`), and
`pull-events.ts` refuses to let dev data reach the canonical `data/events/` record (see "Backing
up the event store" below). Tearing the whole stack down, including its volume
(`docker compose -f docker-compose.dev.yml down -v`), loses nothing that matters.

## Where production's data lives: `~/.local/share/shizi/`

(`harden-event-store`.) The live SQLite file is a fixed host bind mount —
`~/.local/share/shizi/sync-data/`, mounted into `sync` at `/repo/infra/sync-service/data` — not a
Docker-managed named volume. This is deliberately a sibling to `~/.config/shizi/` (config and
secrets), not the same directory: `~/.config/shizi/` holds small, largely hand-edited text;
`~/.local/share/shizi/` holds durable, programmatically-written application *data* (the growing
event database and its own periodic snapshots). Keeping them apart means "what's safe to
`chmod`/back up/treat as sensitive" stays legible instead of accidental.

Before this, the live store lived in a Docker-managed named volume (`events-data`), which worked
but meant any host-side script needed `docker volume inspect ... --format '{{.Mountpoint}}'`
just to find the file — an easy-to-get-wrong extra step that's now gone entirely. Migrated with
the same stop/copy-with-checksums/swap discipline used for every prior migration in this project;
the original `events-data` volume is left in place, untouched, as the rollback path.

`docker-compose.dev.yml`'s `dev-events-data` deliberately stays a Docker-managed named volume —
dev is meant to be trivially disposable (`docker compose down -v`), and its data is already
disposable by design, so a fixed host path would only add cleanup burden for data nobody needs to
keep.

## Backing up the event store

`data/events/events.jsonl` (and `ratings.jsonl`), committed to git via `pull-events.ts`, is the
actual durable copy — not the live SQLite file. The `sync-service` also takes its own local
snapshot every 6 hours (`sync-service/src/backup.ts`, kept alongside the live file) as cheap
insurance against corruption between pulls — that snapshot does **not** survive a lost disk on
its own; true off-site backup would need external storage credentials nobody has supplied, and
remains an open item.

**This now runs automatically, daily, with no person involved.** A dedicated container,
`backup-cron` (`infra/backup-cron.Dockerfile`), runs a cron daemon whose one job
(`infra/backup-cron/crontab`) invokes `infra/sync-service/scripts/backup-and-push.ts`: export,
then commit and push only if the export actually changed — and even when it didn't, append a
line to `data/events/backup-log.txt` so a quiet week and a stalled job are never confused with
each other.

**Why a container instead of the host's own crontab** (which is how this was first built and
verified — see `openspec/changes/harden-event-store/design.md` for the full account): this
project's other infrastructure (`gateway`, `sync`) is already fully containerized, and a host
crontab entry would have been the one piece of it needing host SSH access and `crontab -l` to
inspect or change. Check on it with ordinary Docker tooling instead:

```
docker exec shizi-backup-cron cat /etc/cron.d/shizi-backup   # the schedule
docker logs shizi-backup-cron                                 # every run's output
git log -1 --format=%cr -- data/events/                       # is it actually current?
```

That last command is the whole health check. Because the export is byte-stable for unchanged
data and strictly append-only, the timestamp of the most recent `data/events/` commit answers
"is backup working" by itself — no separate dashboard or alerting to maintain.

**`backup-cron` reuses the SAME deploy clone** the release workflow above operates on — bind-mounted
read-write, not a second internal git clone — plus the deploy key and the event store, each
bind-mounted at the exact absolute host path their respective configs already expect
(`core.sshCommand`, `pull-events.ts`'s fixed default). `npm ci` runs into that bind-mounted clone
at container start only if `node_modules` is missing, so the code that actually runs every day
always matches whatever commit the clone is currently on.

**A deploy key, not the interactive `gh auth` login**, is what the container pushes with —
scoped to this one repository, created via `gh api repos/ayxuerui/shizi/keys`, private half at
`~/.config/shizi/deploy-key` (0600; also record a copy in a password manager — nothing in this
repo should be its only copy). The deploy clone's `origin` remote is the SSH form
(`git@github.com:ayxuerui/shizi.git`) with `core.sshCommand` set **locally in that clone**
(`git config core.sshCommand "ssh -i ~/.config/shizi/deploy-key -o IdentitiesOnly=yes"`) — not
globally — so this identity is scoped to that one clone. That clone's `user.name`/`user.email`
are also set locally, so `backup-cron`'s commits have an author identity; without it, the very
first commit attempt fails with "Author identity unknown."

**Dev's event store is disposable, on purpose (add-dev-deployment).** `docker-compose.dev.yml`'s
`sync-dev` sets `SHIZI_ENV=dev`; `pull-events.ts` reads that and refuses to write the canonical
`data/events/` location unless you pass `--out-dir <path>` explicitly, so a dev-environment
verification session can never quietly become part of the durable learner record. There is
nothing to back up in dev's `dev-events-data` volume — tearing it down loses nothing that matters.

**Superseded:** `automate-event-log-backup` proposed this same backup goal around a `systemd
--user` timer; it was never implemented and is replaced by `harden-event-store`.
