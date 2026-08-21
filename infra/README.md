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

## Setup

1. Copy `sync-service/.env.example` to `sync-service/.env` and set `SYNC_SHARED_TOKEN` (e.g.
   `openssl rand -hex 32`). The service refuses to start without it.
2. Copy `apps/assessment/.env.example` to `apps/assessment/.env` —
   `VITE_SYNC_ENDPOINT=/assessment/sync` is already the right default (see "Domain reuse" above); set
   `VITE_SYNC_TOKEN` to the same value as step 1's `SYNC_SHARED_TOKEN`.
3. Build the app: `npm run build --workspace=apps/assessment`.
4. `docker compose up -d gateway sync` from the repo root.
5. **Your own action, outside this repo:** in the Cloudflare Zero Trust dashboard, edit the existing
   `shizi.realxco.com` public hostname entry to point at the `gateway` container (`shizi-gateway`)
   instead of `spikes`. No new hostname, no path-based ingress rule to add there — nginx handles the
   whole `/assessment` + `/assessment/sync` split internally (see `nginx-assessment.conf.template`).

**Do not `rm -rf apps/assessment/dist` and rebuild in place while `gateway` is running.**
`gateway`'s bind mount is established by inode at container start; recreating the directory at
the same path (rather than overwriting files within it) leaves the running container's mount
pointing at nothing. `npm run build` alone (no `rm -rf` first) is safe — Vite overwrites files
in place. If you do need to wipe `dist/` first, run `docker restart shizi-gateway` afterward, and
confirm with `curl localhost:8081/assessment/`. (Discovered the hard way while verifying this
very section — see `openspec/changes/add-dev-deployment/design.md`'s "Two builds in one repo can
be confused on the host" risk entry.)

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
3. Build with the dev flag: `npm run build --workspace=apps/assessment -- --mode dev`. This is
   what makes the build identifiable on-device — the PWA installs as "shizi dev" instead of
   "shizi", and the unlock/diagnostics screens show a small `DEV` marker (never inside the bout
   itself). A build without `--mode dev` is indistinguishable from production once installed.
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

## Backing up the event store

The live SQLite file (`sync-service`'s `events-data` Docker volume) is **not** the durable copy —
`data/events/events.jsonl`, committed to git via `pull-events.ts`, is. Run that script periodically
(there's no built-in schedule; a cron job or a manual habit both work) and commit the result. The
service also takes its own local snapshot every 6 hours (`sync-service/src/backup.ts`, kept on the
same volume) as cheap insurance against the live file getting corrupted between JSONL pulls — that
snapshot does **not** survive a lost disk on its own; true off-site backup would need external
storage credentials nobody has supplied yet, and is an open item, not solved here.

**Run it on the host, not via `docker exec`.** `pull-events.ts` resolves its output relative to
where the script *file* lives — correct when run on the host (`npm run pull:events` from
`infra/sync-service`, pointed at the volume's real data via `EVENTS_DB_PATH`), but a no-op for the
purpose of getting a git-committable file if run as `docker exec shizi-sync npx tsx
scripts/pull-events.ts`: the Dockerfile bakes `/repo` in at build time (only the SQLite data
directory is a real volume mount), so a write there lands in that container's own writable layer
and is gone the next time the container is recreated. Find the volume's real host path with
`docker volume inspect shizi_events-data --format '{{.Mountpoint}}'` and run, from
`infra/sync-service`:

```
EVENTS_DB_PATH=<mountpoint>/events.sqlite npx tsx scripts/pull-events.ts
```

**Dev's event store is disposable, on purpose (add-dev-deployment).** `docker-compose.dev.yml`'s
`sync-dev` sets `SHIZI_ENV=dev`; `pull-events.ts` reads that and refuses to write the canonical
`data/events/` location unless you pass `--out-dir <path>` explicitly, so a dev-environment
verification session can never quietly become part of the durable learner record. There is
nothing to back up in dev's `dev-events-data` volume — tearing it down loses nothing that matters.
