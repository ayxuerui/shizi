## Context

See proposal.md — Why. What follows is only the current state that constrains the approach.

Production is one flat `docker-compose.yml` on the host: `gateway` (nginx, `shizi-gateway`,
`8081:80`) bind-mounting `apps/assessment/dist` and `infra/nginx-assessment.conf`, plus `sync`
(`shizi-sync`, no published port), both joined to the pre-existing external `cloudflared-net`
bridge. TLS terminates at Cloudflare; `cloudflared` runs a remotely-managed tunnel, so ingress
rules live in the Zero Trust dashboard and in no file in this repo. Deployment is manual: build
on the host, restart the container.

Four properties of the existing build constrain everything below:

1. `vite.config.ts`'s `base: "/assessment/"` is compile-time, and `styles/fonts.css` hardcodes
   `/assessment/fonts/...` because Vite does not rewrite hand-authored `url()` for `public/`
   assets when `base` is not `/`. Any environment served under a *different* prefix would
   silently break the font. Keeping `/assessment/` everywhere avoids the problem entirely — and
   a second hostname gives dev its own origin, so there is no collision to resolve.
2. `VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN` are build-time inlined (`offline/endpoint.ts`). A
   second environment therefore needs its own *build*, not merely its own container env.
3. Both stacks must sit on `cloudflared-net` for the tunnel to reach them, and Docker aliases
   every container by its compose service name on each network it joins. Two services both
   named `sync` on that shared network would give the gateways nondeterministic round-robin DNS.
4. Production's compose project name is currently the git-worktree directory it was launched
   from (`bridge-cse_014e5ybp6lpcxeuz1ssuf4ra`), so the live event-store volume is
   `bridge-cse_014e5ybp6lpcxeuz1ssuf4ra_events-data`.

## Goals / Non-Goals

**Goals:**
- Dev and prod differ in exactly three axes — hostname, sync destination, and build-time
  environment identity — and in nothing else, so that what passes on dev is evidence about prod.
- Routing configuration has one source of truth, not two copies that can drift.
- The isolation guarantees in `specs/deployment/spec.md` are checkable by running commands, not
  by reading the compose files and believing them.

**Non-Goals:**
- Reproducing prod's *host* environment. Dev is the same machine, same Docker daemon, same
  tunnel. This buys build/routing/PWA/device fidelity, not infrastructure fidelity — and device
  fidelity is what the outstanding Section 10 checks actually need.
- Making dev long-lived or continuously deployed. It is spun up against whatever tree is being
  verified and torn down after.
- Generalizing to N environments. The design supports two; a third would want the compose
  duplication factored out first, and there is no third yet.

## Decisions

### A second hostname, deviating from the "one domain, one holding service" principle

`bootstrap-shizi-assessment`'s design.md records a principle stated by the user verbatim:
*"how about shizi.realxco.com/assessment? So that I only need to manage one domain and one
holding service."* That principle is about not multiplying tunnel targets **per app** — a second
app gets a path prefix on the same gateway, not its own hostname. **Decision:** it does not
extend to a second *environment* of the same app, and this change deviates deliberately, at the
user's request. A path prefix cannot express an environment here: `base` is compile-time and
`fonts.css` hardcodes the prefix (Context 1), so `shizi.realxco.com/assessment-dev/` would need a
divergent build — meaning the artifact under test would no longer be the artifact that ships,
which is the one property a verification environment must have. Same-origin also means one
service-worker scope, one storage container, and one PWA identity shared between environments.
A separate hostname gives dev a separate origin for free, and the extra cost is one dashboard
entry, one time.

**Alternative rejected:** a `server_name`-keyed second `server` block inside the existing
`shizi-gateway` container, keeping one tunnel target. It is the closest thing to honoring the
original principle, and it was rejected because it couples the two environments exactly where
they must not be coupled: editing or reloading dev's config restarts the container serving the
child's live app. A second Zero Trust public hostname must be created either way, so the "one
target to manage" saving is not actually realized.

### One nginx config, rendered per stack — not two files

Dev's gateway must proxy to `sync-dev` and prod's to `sync` (Context 3), but every other rule
must stay byte-identical. **Decision:** rename `infra/nginx-assessment.conf` to
`nginx-assessment.conf.template`, parameterize the single upstream as `${SYNC_UPSTREAM}`, and
mount it into `/etc/nginx/templates/default.conf.template`, where the stock `nginx:alpine`
entrypoint runs `envsubst` at container start. `NGINX_ENVSUBST_FILTER` is set so substitution is
restricted to that one variable — without it, `envsubst` would be a live hazard to nginx's own
`$host`, `$scheme`, and `$proxy_add_x_forwarded_for`, which share the same syntax. This is the
mechanism behind the spec's "single source of truth" requirement, and it is why the environment
parity scenario is phrased as *inspect the effective configuration of each running container*
rather than *compare the files*.

**Alternative rejected:** copy the file to `nginx-assessment-dev.conf` and edit one line. Simpler
today, and wrong tomorrow: the config's real content is a set of easily-forgotten correctness
rules — the `sw.js` `Cache-Control: no-cache` header (without which a new build can never reach
an installed device), the `.webmanifest` MIME override, the bare-`/assessment` redirect. A dev
gateway missing any of these produces *false* verification results, which is worse than having
no dev environment at all.

### Dev sync is unreachable from the shared network at all

**Decision:** dev's gateway joins both `cloudflared-net` (so the tunnel can reach it) and a new
private `shizi-dev-net`; dev's sync service joins **only** `shizi-dev-net`. Distinct service
names (`gateway-dev`/`sync-dev`) then make the DNS alias collision in Context 3 impossible by
construction rather than by convention, and prod's gateway has no network path to dev's sync even
if someone later edits an upstream name by mistake. This is what makes the spec's "each gateway
reaches only its own sync service" requirement structural instead of aspirational.

### Environment identity is an explicit build variable, not Vite's `mode`

**Decision:** an explicit `VITE_APP_ENV=dev`, read in `vite.config.ts` via `loadEnv`, drives both
the PWA manifest name and the in-app badge. Dev builds run `vite build --mode dev`, which loads
`.env.dev` — but `mode` itself is deliberately not the signal. `vite build --mode dev` still
produces a `NODE_ENV=production` build (Vite only treats the literal mode `development`
specially), so keying behavior off `mode` would invite exactly the confusion where someone reads
"dev build" as "development build." A named variable says what it means, and keeps the door open
to building a dev-labeled artifact from any mode.

`.env.dev.example` needs a `.gitignore` fix: the existing `.env.*` / `!.env.example` pair ignores
it, since the negation only un-ignores that one literal filename. Widening to `!.env.*.example`
is required for the file to be committable at all — the kind of thing that otherwise gets
discovered as a mysteriously absent file after a clone.

### The badge is confined to the same screens the diagnostics UI is

The assessment spec's no-visible-scoring guarantee is enforced structurally, and
`BoutScreen.test.tsx` asserts no digit ever renders in the bout tree. **Decision:** the badge
renders in `AudioUnlockGate` and `DiagnosticsScreen` only, never inside `BoutScreen` — the same
containment rule `diagnostics/theme.ts` already follows for its `OK`/`ATTENTION` palette. The
unlock screen is the correct primary home: it is the one screen shown at every cold start,
including an offline one and including inside standalone home-screen mode where there is no
address bar to read the hostname from. That is precisely the situation where confusing dev for
prod is possible, so it is where the marker has to be. The spec states this as a requirement
rather than leaving it to review, because "just this once, in the bout" is exactly how such a
guarantee erodes.

### Pin `name: shizi` now, while the volume is nearly empty

**Decision:** fold the production project-name fix into this change rather than deferring it. The
migration is a stop, a volume copy, and a start; today `data/events/` does not exist and the
live store holds only verification data from Section 9, so a mistake costs nothing real. After
Section 10's first session it costs the child's actual learning history. **Trade-off accepted:**
this change touches production, which a purely additive dev-environment change would not have —
justified because the alternative is building the second stack on top of a project namespace
named after a worktree that is expected to be deleted.

### The canonical-record guard is partial, and says so

`pull-events.ts` resolves its output as `<repoRoot>/data/events/` unconditionally, taking only the
*input* database from an argument or `EVENTS_DB_PATH`. **Decision:** add a `SHIZI_ENV` marker to
each stack's sync service and an explicit `--out-dir` option to the script; when `SHIZI_ENV=dev`
and no `--out-dir` is given, the script refuses and names the path it declined to write.
**Flagged, not solved:** this guards the natural path — running the exporter inside the dev
container, where the marker is set — and not a host-side invocation that passes the dev database
as an argument with `SHIZI_ENV` unset. A stronger guard would mean stamping the environment into
the SQLite file itself at creation and checking it on read. That is the right fix if this ever
bites; it is more machinery than the risk currently justifies, and inventing it now would be
guessing at a failure that has not happened.

**Found while testing the guard, not something this change introduced or is scoped to fix:**
running `pull-events.ts` via `docker exec <container> npx tsx scripts/pull-events.ts` — the way
`bootstrap-shizi-assessment`'s own tasks 7.4/9.5 completion notes describe verifying it — never
reaches the real host git tree at all, for *either* stack. `infra/sync-service/Dockerfile`
`COPY`s the repo into the image at build time; the only actual volume mount is
`/repo/infra/sync-service/data` (the SQLite file itself). So `<repoRoot>/data/events` inside the
container resolves to a path baked into that container's own writable layer — the write
succeeds, but it is invisible to the host and is lost the moment the container is recreated.
Confirmed directly: a host-side run with `EVENTS_DB_PATH` pointed at the volume's real host
mountpoint (`docker volume inspect <volume> --format '{{.Mountpoint}}'`) *does* land in the real
repo tree; a `docker exec` run does not. This predates this change and is out of scope for it to
fix (it belongs to Section 9's original design, not to environment isolation), but it changes
what a passing guard test proves: refusing to write from inside a container demonstrates the
*code* is correct, not that the in-container invocation was ever a working backup path to begin
with. `infra/README.md`'s backup section is updated to say so plainly, so a future reader running
the documented `docker compose exec sync ...` form doesn't believe they have a backup when they
don't.

### Deliberately not built

- **Cloudflare Access on the dev hostname.** An Access login sits in front of the origin, which
  interferes with add-to-home-screen and with an airplane-mode cold start — the two checks dev
  exists to run. Prod is already a bare public hostname; matching it keeps the comparison honest.
  Revisit if the dev hostname ever serves something prod does not.
- **A CD pipeline.** `ci.yml` still stops at `build`. Auto-deploying to dev is the obvious next
  step and is not this change: it needs a runner with access to this host, which is a separate
  decision about exposing the machine.
- **A staging tier.** Two environments cover the stated need. A third would want the compose
  duplication factored out first.

## Risks / Trade-offs

- **Volume migration touches the live event store** → Stop the stack before copying, so SQLite
  checkpoints its WAL rather than leaving `-wal`/`-shm` to be copied mid-write; copy rather than
  rename, leaving the original volume intact as the rollback; verify by comparing row counts
  before and after, and only then delete the old volume — or simply leave it, at 292K.
- **Prod's `dist/` bind-mount moves with the checkout** → After the migration, prod serves the
  main checkout's `apps/assessment/dist`, which will not exist until a build runs there. The
  migration steps must include `npm ci && npm run build --workspace=apps/assessment` and copying
  `infra/sync-service/.env` across *before* starting the stack, or prod comes up empty.
- **Hardcoded `container_name` means one dev stack at a time** → Accepted, and in fact required:
  the Zero Trust entry targets a fixed container name, so a stable name is what makes the
  hostname work at all. Starting a second dev stack from another worktree fails loudly on the
  name conflict rather than silently stealing traffic. Documented in `infra/README.md`.
- **Two builds in one repo can be confused on the host** → `npm run build` writes
  `apps/assessment/dist` in whichever tree it runs in. Because dev is per-worktree and prod now
  runs from the main checkout, the two `dist/` directories are naturally distinct — but building
  dev in the main checkout would overwrite what prod serves. The badge and manifest name make
  this visible after the fact; the operating model (prod from the main checkout, dev from a
  worktree) is what prevents it, and belongs in `infra/README.md`.
- **Found live, during this change's own implementation:** because tasks 3.2/3.6 cut production
  over to run from *this* worktree (the user's explicit choice, given the main checkout didn't
  yet have this change's code — see task 3.2's note), that worktree's `apps/assessment/dist` is
  now the live bind-mount source for `shizi-gateway`. Rebuilding it in place with `rm -rf dist &&
  npm run build` — done here twice, to compare a prod build's manifest name against a dev build's
  — left the container's bind mount pointing at a deleted, now-empty directory: Docker's bind
  mount is established by inode at mount time, and recreating a directory at the same path does
  not reattach it. The live site 404'd (for at least one real external client, per the access log)
  and then 403'd for about four minutes before `docker restart shizi-gateway` re-established the
  mount against the rebuilt directory. **Mitigation, applied for the rest of this change's own
  verification and worth keeping as an operating rule:** never `rm -rf`/rebuild
  `apps/assessment/dist` in place while `shizi-gateway` is running against this checkout — build
  into a scratch output directory for any side-by-side comparison, and restart the gateway
  container (not just re-run the build) after any build that DOES intentionally target the live
  `dist/`.
- **`NGINX_ENVSUBST_FILTER` behavior is version-dependent** → It is a documented feature of the
  official nginx image, but the consequence of getting it wrong is a mangled config that could
  break *production* routing. Mitigated by making the very first verification step a dump of the
  rendered config out of the running prod container, diffed against today's file — a real check
  that the template round-trips, not an assumption.
- **Two PWAs installed on one iPad still share a screen** → Distinct origins give distinct
  storage and service-worker scopes, so there is no technical crossover; the residual risk is
  purely human. The manifest name plus the unlock-screen badge address it, and the device check
  is written into tasks.md as the user's own step rather than assumed.

## Migration Plan

One-time, in this order, with production briefly down:

1. From the main checkout: `npm ci` and `npm run build --workspace=apps/assessment`; copy
   `infra/sync-service/.env` over from the worktree that currently runs prod.
2. Record the current event and rating counts from the live store.
3. `docker compose down` from that worktree — this checkpoints the WAL into `events.sqlite`.
4. `docker volume create shizi_events-data`, then copy the old volume's contents into it with a
   throwaway container.
5. `docker compose up -d gateway sync` from the main checkout, with `name: shizi` in place.
6. Compare counts against step 2, and confirm `shizi.realxco.com/assessment/` serves.

**Rollback:** the original volume is untouched, so reverting is `docker compose down`, restore
`docker-compose.yml`, and bring the stack back up from the old worktree. Nothing about the dev
stack is entangled with this — it can be added or removed independently.
