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
- `nginx-assessment.conf` — the `gateway` (`shizi-gateway`) container's config: serves the built
  `apps/assessment/dist` (task 9.1) under a `/assessment/` path prefix, same pattern as
  `spikes/nginx-default.conf` plus a `Cache-Control: no-cache` rule on `sw.js` (a cached
  service-worker file would permanently block PWA updates from reaching the device). Also
  reverse-proxies `/assessment/sync/*` to the `sync` service over the shared `cloudflared-net`
  docker network, and redirects the bare domain root to `/assessment/` — see below.

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
registration scope are built against that prefix, and `nginx-assessment.conf` uses `alias` (not
`root`) in its location blocks to strip the prefix before looking files up on disk. Visiting the bare
domain (`/`) 302-redirects to `/assessment/` for convenience.

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
   whole `/assessment` + `/assessment/sync` split internally (see `nginx-assessment.conf`).

## Backing up the event store

The live SQLite file (`sync-service`'s `events-data` Docker volume) is **not** the durable copy —
`data/events/events.jsonl`, committed to git via `pull-events.ts`, is. Run that script periodically
(there's no built-in schedule; a cron job or a manual habit both work) and commit the result. The
service also takes its own local snapshot every 6 hours (`sync-service/src/backup.ts`, kept on the
same volume) as cheap insurance against the live file getting corrupted between JSONL pulls — that
snapshot does **not** survive a lost disk on its own; true off-site backup would need external
storage credentials nobody has supplied yet, and is an open item, not solved here.
