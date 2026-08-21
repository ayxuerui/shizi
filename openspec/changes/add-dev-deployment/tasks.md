## 1. Shared routing config (do first — prod depends on it)

Both stacks must serve identical rules with only the sync upstream differing
(`specs/deployment/spec.md`'s "Environments serve identical routing behavior"). Templating the
existing config is the first step because prod's compose changes in section 3 depend on it.

- [x] 1.1 Rename `infra/nginx-assessment.conf` to `infra/nginx-assessment.conf.template` and
      replace the single `proxy_pass http://sync:8787/` host with `${SYNC_UPSTREAM}`. Change
      nothing else — the `sw.js` no-cache header, `.webmanifest` MIME override, `alias`-based
      prefix stripping, and both redirects stay byte-for-byte as they are. Extend the file's
      header comment to explain the template mechanism and the `NGINX_ENVSUBST_FILTER` guard.
- [x] 1.2 Update `docker-compose.yml`'s `gateway` to mount the template at
      `/etc/nginx/templates/default.conf.template` (not `/etc/nginx/conf.d/default.conf`) and set
      `SYNC_UPSTREAM: sync` plus a `NGINX_ENVSUBST_FILTER` restricted to that one variable, so
      `envsubst` cannot touch nginx's own `$host`/`$scheme`/`$proxy_add_x_forwarded_for`.
- [x] 1.3 Verify the round-trip before anything else changes: ~~recreate `shizi-gateway`~~ —
      verified against a throwaway `nginx:1.27-alpine` container joined to `cloudflared-net`
      instead, because production still runs from a different worktree whose compose file
      predates this rename, and `container_name: shizi-gateway` is hardcoded, so recreating it
      from here would have stolen the live container. Same image, same entrypoint, same template,
      same env vars — and safer: prod's own in-place recreation lands in 3.6, checked again in
      7.2. **Verified:** `nginx -t` passes on the rendered output, the container reaches
      `running` (attaching it to `cloudflared-net` matters — nginx refuses to *start* when a
      `proxy_pass` host does not resolve, so this proves the rendered config is one nginx
      accepts, not merely one that renders), `GET /assessment/` returns 200 and `GET /` returns
      302, the rendered body is byte-identical to the pre-rename
      `infra/nginx-assessment.conf` from git (the only diff is the added header comment), and
      nginx's own `$host`/`$remote_addr`/`$proxy_add_x_forwarded_for`/`$scheme` all survive the
      envsubst pass intact. **Found and fixed here, not assumed:** the header comment originally
      wrote the placeholder in `${...}` form, and envsubst rewrites comments too — so the prod
      and dev renders differed in *two* places, muddying exactly the one-line parity check this
      template exists to make crisp. The comment now names the variable without the
      dollar-brace syntax, and the prod-vs-dev diff is a single line: the upstream.

## 2. Dev stack

- [x] 2.1 Add `docker-compose.dev.yml` with a top-level `name: shizi-dev`, carrying the same
      density of explanatory comments as `docker-compose.yml` (why a second hostname, why a
      separate container rather than a `server_name` block, the one-stack-at-a-time constraint).
- [x] 2.2 Define `gateway-dev`: `nginx:1.27-alpine`, `container_name: shizi-gateway-dev`, host
      port `8082:80`, bind-mounting `./apps/assessment/dist` and the section-1 template, with
      `SYNC_UPSTREAM: sync-dev`. Joined to both `cloudflared-net` (external, so the tunnel can
      reach it) and a new private `shizi-dev-net`.
- [x] 2.3 Define `sync-dev`: same build context/Dockerfile as prod's `sync`,
      `container_name: shizi-sync-dev`, `env_file: ./infra/sync-service/.env.dev`,
      `SHIZI_ENV: dev`, its own `dev-events-data` volume, **no published host port**, and joined
      to `shizi-dev-net` only — never `cloudflared-net`, so the DNS-alias ambiguity between two
      sync services is structurally impossible (design.md, "Dev sync is unreachable from the
      shared network at all").
- [x] 2.4 Add `infra/sync-service/.env.dev.example` with its own `SYNC_SHARED_TOKEN` placeholder
      and a comment stating that it MUST NOT be the same value as prod's — the spec's
      "a credential leaked from one environment does not open the other" scenario.

## 3. Production project-name pin and volume migration

Ordered deliberately: build and copy first, cut over last, and keep the old volume as the
rollback (design.md, "Migration Plan").

- [x] 3.1 Add `name: shizi` and `SHIZI_ENV: prod` to `docker-compose.yml`. Verified:
      `docker compose config --quiet` resolves cleanly and every unqualified resource
      (`events-data` volume, `gateway`/`sync` services) now resolves under project `shizi`
      regardless of launch directory.
- [x] 3.2 ~~From the main checkout `/home/ubuntu/workspace/shizi`~~ — **the user, asked directly
      about this exact gap, chose to cut over from this session's worktree instead** (this
      change's code isn't committed/merged to `main` yet, so the literal main checkout doesn't
      have `docker-compose.yml`'s new `name:`/template wiring). This does mean production is
      currently served from a worktree checkout again until a post-merge redeploy — but that
      redeploy is now a plain, low-risk `git pull && npm run build && docker compose up -d`
      from wherever `main` is checked out, not another migration: `name: shizi` and every
      `container_name` are fixed by the compose file's own content, not derived from the launch
      directory, so the identity this task exists to fix does not regress even though the
      *files* still live in a worktree today. Ran `npx tsc -b` (workspace package builds) then
      `npm run build --workspace=apps/assessment` from this worktree; copied
      `infra/sync-service/.env` and a matching `apps/assessment/.env` (token copied from the
      former) across from the worktree that had been running prod. Build succeeded with no code
      changes yet, so it is byte-for-byte the same app prod was already serving.
- [x] 3.3 Record the live event and rating counts from the current store, for the step-3.6
      check. **Result: 0 events, 0 ratings, 0 assignments** — confirms design.md's assumption
      that no real learner data exists yet, so this migration's actual risk was nil.
- [x] 3.4 `docker compose down` from the worktree currently running prod — this checkpoints
      SQLite's WAL into `events.sqlite` instead of copying a mid-write `-wal`/`-shm` pair.
      Verified: `shizi-gateway`/`shizi-sync` stopped and removed cleanly; `shizi-spikes`
      (unrelated service, same host) was left running and unaffected.
- [x] 3.5 `docker volume create shizi_events-data` and copy the old volume's contents in with a
      throwaway container. Copy, do not rename: the original volume stays intact as the rollback.
      **Verified with per-file md5sum, not just a file listing:** `events.sqlite`,
      `events.sqlite-wal`, `events.sqlite-shm`, and all 6 files under `backups/` produced
      identical checksums on both sides. Old volume
      (`bridge-cse_014e5ybp6lpcxeuz1ssuf4ra_events-data`, 283kB) left in place, attached to no
      running container, as the rollback path.
- [x] 3.6 ~~from the main checkout~~ — from this worktree, per 3.2's note.
      `docker compose up -d gateway sync`. **Found during this step, not before:** Compose
      logged `volume "shizi_events-data" already exists but was not created by Docker
      Compose` — expected, since 3.5 created it manually for the checksum-verified copy; it
      mounted and is being used identically to a Compose-created volume, just without
      Compose's own labels. Cosmetic (it will repeat on every future `up`; it does not affect
      mounting, persistence, or data), left as-is rather than taking on more downtime to
      relabel it, and recorded in `infra/README.md`. **Verified end-to-end:** containers are
      `shizi-gateway`/`shizi-sync` under project `shizi`; `shizi-sync`'s only volume mount is
      `shizi_events-data:/repo/infra/sync-service/data`; live counts read back as 0/0/0,
      matching 3.3; `curl localhost:8081/assessment/` → 200, `/` → 302, `sw.js`
      `Cache-Control: no-cache`, `.webmanifest` → `application/manifest+json`; an authenticated
      `POST /assessment/sync/events` round-tripped through the now-templated nginx config
      (`{"inserted":0,"duplicates":0,"rejected":0}`).

## 4. Dev build identity

- [x] 4.1 Widen `.gitignore`'s negation to `!.env.*.example` — the existing `.env.*` /
      `!.env.example` pair would otherwise ignore the new example files entirely. Verified:
      `git check-ignore` confirms `infra/sync-service/.env.dev.example` and
      `apps/assessment/.env.dev.example` are now trackable while `infra/sync-service/.env`
      (the real secret) remains ignored.
- [x] 4.2 Add `apps/assessment/.env.dev.example`: `VITE_APP_ENV=dev`,
      `VITE_SYNC_ENDPOINT=/assessment/sync` (unchanged — dev has its own origin, so the relative
      same-origin path is still correct), and an empty `VITE_SYNC_TOKEN` to be matched to
      task 2.4's dev token.
- [x] 4.3 Convert `apps/assessment/vite.config.ts` to the `defineConfig(({ mode }) => ...)` form
      and use `loadEnv` to read `VITE_APP_ENV`; when it is `dev`, set the PWA manifest's `name`
      and `short_name` to `shizi dev`. Leave `base`, `start_url`, `scope`, icons, and
      `workbox.globPatterns` untouched. Comment why `VITE_APP_ENV` rather than `mode` is the
      signal (design.md — `vite build --mode dev` is still a `NODE_ENV=production` build).
      Verified: `npm run typecheck --workspace=apps/assessment` passes clean.
- [x] 4.4 Add an environment-badge component under `apps/assessment/src/` that renders nothing
      unless `VITE_APP_ENV` is set, styled from a module-local palette rather than a new
      `styles/tokens.css` token — that file's lack of a status/error token is itself the
      enforcement mechanism behind "no visible failure state," the same reasoning
      `diagnostics/theme.ts` already follows. `src/components/EnvBadge.tsx`, `position: fixed`
      (not `absolute`) so it doesn't depend on either call site's positioning context.
- [x] 4.5 Render the badge from `AudioUnlockGate` and `DiagnosticsScreen` only. **Not** from
      `BoutScreen` or anything inside it: `BoutScreen.test.tsx`'s `assertNoScoreLikeText` sweep
      must stay intact, and the spec states the containment as a requirement rather than leaving
      it to code review. `AudioUnlockGate.tsx` renders it only in its pre-unlock branch — the
      `if (unlocked) return <>{children}</>` early-return already excludes it from wrapping the
      bout tree, so this is structural, not just a matter of where the JSX line was added.
- [x] 4.6 Test both directions — a default build renders no badge and keeps the manifest name
      `shizi`; a `VITE_APP_ENV=dev` build renders it on the unlock screen and names the app
      `shizi dev`. Assert the bout tree stays badge-free in the dev case too. Added
      `EnvBadge.test.tsx` (renders nothing unset, renders "DEV" for `VITE_APP_ENV=dev`) and three
      cases in `App.test.tsx`: marker visible on the unlock screen for a dev build, marker
      absent from the bout tree after tapping through (even for a dev build — the actual
      containment proof `BoutScreen.test.tsx`'s digit/`%` sweep can't provide, since "DEV"
      contains neither), and no marker at all for a default build. All 13 tests across the three
      affected files pass. Build identity confirmed directly too: `vite build` (default mode) →
      manifest `"name":"shizi"`; `vite build --mode dev` (with `.env.dev` present) → manifest
      `"name":"shizi dev"`.
      **Found live, during this verification, not assumed away:** rebuilding
      `apps/assessment/dist` in place (twice, `rm -rf dist && npm run build`, to compare the two
      manifests) broke the live site — this checkout's `dist/` is now `shizi-gateway`'s bind-mount
      source (tasks 3.2/3.6), and Docker's bind mount doesn't reattach when the source directory
      is deleted and recreated at the same path. `shizi.realxco.com` 404'd then 403'd for about
      four minutes, including at least one real external request per the access log, before
      `docker restart shizi-gateway` fixed it. Recorded as a design.md risk with the operating
      rule this implies (build comparisons into a scratch dir; restart the gateway after any
      build that targets the live `dist/`). Confirmed healthy afterward: `/assessment/` → 200,
      manifest → `"shizi"`, `sw.js` → `Cache-Control: no-cache`, `/assessment/sync/health` → ok.

## 5. Canonical-record guard

- [x] 5.1 Add an `--out-dir` option to `infra/sync-service/scripts/pull-events.ts`, defaulting to
      today's `<repoRoot>/data/events` so production behavior is unchanged. Decomposed the script
      into `resolveOutDir`/`pullEvents` (pure, importable) plus a thin `import.meta.url ===
      file://${process.argv[1]}` CLI guard around the original top-level behavior — same
      "extract the logic, keep the entrypoint thin" split this package already uses for
      `handle-sync.ts` vs `server.ts`.
- [x] 5.2 Make the script refuse to write when `SHIZI_ENV=dev` and no `--out-dir` was given,
      exiting non-zero with a message naming the canonical path it declined to touch. It must
      refuse even when that path does not exist yet — the guard is about the destination, not
      about overwriting something that happens to be there. `resolveOutDir` throws a named
      `CanonicalRecordGuardError` before any directory is created or file touched, so refusal is
      structural (nothing to write happens at all), not a check-then-write race.
- [x] 5.3 Unit-test all three branches from the spec: dev without `--out-dir` refuses and writes
      nothing; dev with `--out-dir` writes there and succeeds; prod without `--out-dir` writes the
      canonical path as before. `infra/sync-service/scripts/pull-events.test.ts`, 7 tests (both
      the pure `resolveOutDir` decision and `pullEvents` end-to-end against a real temp SQLite
      store). **Found while writing these:** `vitest.config.ts`'s `include` was `src/**/*.test.ts`
      only — this package's first test under `scripts/` was silently never collected, the same
      class of gap `apps/assessment/vitest.config.ts`'s own header comment already flags for that
      package; widened to `["src/**/*.test.ts", "scripts/**/*.test.ts"]`. All 42 sync-service
      tests pass (up from 35); `npm run typecheck` clean. The prod-path test writes the REAL
      repo-root `data/events/` (that's the behavior under test) and removes it again in the same
      test — confirmed empty afterward.
      **Found live while manually exercising the guard, not just unit-tested:** running the
      script via `docker exec shizi-sync npx tsx scripts/pull-events.ts` "succeeds" but never
      reaches the host's real repo tree at all — `infra/sync-service/Dockerfile` bakes `/repo` in
      at build time, and the only real volume mount is the SQLite data directory, not the repo
      root. Confirmed the actual working path instead: running the script ON THE HOST with
      `EVENTS_DB_PATH` pointed at the volume's real mountpoint
      (`docker volume inspect <volume> --format '{{.Mountpoint}}'`) correctly writes
      `data/events/{events,ratings}.jsonl` into the real repo (verified, then removed — 0 rows,
      nothing lost). This is a pre-existing gap in Section 9's original design, not something
      this change is scoped to fix, but it's now documented (design.md, "Found while testing the
      guard") rather than left for someone to discover the hard way after real learner data
      exists.
- [x] 5.4 Extend the script's header comment and `infra/README.md`'s backup section to state that
      dev event data is disposable by design and never belongs in `data/events/`, and correct the
      backup section to describe the host-side invocation as the one that actually reaches the
      real repo tree (see 5.3's finding).

## 6. Documentation

- [x] 6.1 Add a "Dev environment" section to `infra/README.md`: setup steps mirroring the existing
      numbered list, the separate token requirement, the `--mode dev` build command, the
      one-dev-stack-at-a-time constraint and why the fixed container name causes it, and the
      operating model that keeps the two `dist/` directories apart (prod from the main checkout,
      dev from the worktree under verification).
- [x] 6.2 Document the completed volume migration and the `name: shizi` pin in `infra/README.md`,
      including how to roll back while the old volume still exists. Also added a standalone
      warning against `rm -rf`-ing `apps/assessment/dist` in place while `gateway` is running —
      the exact mistake made and fixed live during this change's own section 4 verification (see
      design.md).
- [x] 6.3 Update `infra/README.md`'s description of `nginx-assessment.conf` to cover the template
      and the `SYNC_UPSTREAM`/`NGINX_ENVSUBST_FILTER` mechanism.

## 7. Verification

Every item here is a command to run, not a claim to make. Each maps to a scenario in
`specs/deployment/spec.md`.

- [x] 7.1 `npm run lint && npm run typecheck && npm run test && npm run build` across the
      workspace. All pass: lint clean, typecheck clean across all 8 workspace packages, 351/351
      tests across 56 files (up from 344/56 before this change — `EnvBadge.test.tsx` (2),
      `App.test.tsx`'s 3 new containment cases, `pull-events.test.ts` (7), net of the 2 pre-existing
      App tests it's added alongside), full build succeeds including the real PWA precache guard.
- [x] 7.2 **Parity:** dump the rendered config from both running gateways
      (`docker exec <container> cat /etc/nginx/conf.d/default.conf`) and diff them — the only
      difference must be `sync` vs `sync-dev`. Confirmed against the real live `shizi-gateway` and
      a real `shizi-gateway-dev` brought up from `docker-compose.dev.yml`: one-line diff (the
      `proxy_pass` target), `nginx -t` passes on both.
- [x] 7.3 **Both up at once:** `curl` `/assessment/` on `localhost:8081` and `localhost:8082`;
      confirm 200 on both, plus correct `.webmanifest` content type, `sw.js`
      `Cache-Control: no-cache`, and the font subset on **both**. Confirmed with both stacks
      genuinely running concurrently. `gateway-dev`'s bind-mount source
      (`./apps/assessment/dist`) was left as the checkout's existing prod-flavored build for this
      infra-level check, rather than rebuilt in place — see task 4.6's finding about rebuilding
      that path while `shizi-gateway` depends on it; the dev-vs-prod manifest-name difference
      itself was already verified directly against a scratch build in task 4.6.
- [x] 7.4 **Store isolation:** POST an authenticated event to dev's `/assessment/sync/events`,
      then confirm the row exists in `dev-events-data` and does **not** exist in
      `shizi_events-data`. Confirmed against the real live stacks: `{"inserted":1}`, present in
      dev's SQLite by id, absent from prod's (prod stayed at 0 events throughout this whole
      section).
- [x] 7.5 **Token isolation:** present dev's token to prod's sync endpoint and prod's to dev's;
      both must be rejected as unauthorized. Confirmed: both directions → 401; each token against
      its own endpoint → 200.
- [x] 7.6 **Upstream determinism:** restart prod's stack while dev is running, then repeat 7.4 —
      dev's sync request must still be served by `shizi-sync-dev`. Repeat with the start order
      reversed. Confirmed both directions: prod restarted while dev serving → dev's follow-up POST
      still landed in `shizi-sync-dev` (event count 1→2); dev restarted afterward → prod
      unaffected (still 200, still 0 events), dev's rendered `proxy_pass` still read `sync-dev`.
- [x] 7.7 **Guard:** run the exporter inside `shizi-sync-dev` with no `--out-dir`; confirm a
      non-zero exit and that `data/events/` is untouched. Then run it with `--out-dir` and
      confirm it writes there. Confirmed against the real container: no `--out-dir` → exit 1,
      message names `/repo/data/events`, host `data/events/` never existed throughout; with
      `--out-dir /tmp/dev-export` → exit 0, both dev-store events written there.
- [x] 7.8 **Blast radius:** `docker compose -f docker-compose.dev.yml down -v` and confirm prod is
      still serving and its event count is unchanged — the spec's "non-production is rebuilt from
      scratch" scenario. Confirmed: full teardown (containers, network, and the
      `dev-events-data` volume all removed); prod unaffected — still 200, still 0 events.
- [x] 7.9 **Build identity:** confirm the dev build's `dist/manifest.webmanifest` names the app
      `shizi dev` and prod's still names it `shizi`. Already confirmed directly in task 4.6
      (`vite build` → `"shizi"`, `vite build --mode dev` → `"shizi dev"`); the live prod `dist/`
      re-checked here and unaffected by this section's dev-stack testing.

## 8. The user's own actions, outside this repo

- [x] 8.1 In the Cloudflare Zero Trust dashboard, add a `shizi-dev.realxco.com` public hostname
      targeting `http://shizi-gateway-dev:80`. Nothing in this repo can create it — the same
      situation as task 9.1's prod repoint in `bootstrap-shizi-assessment`. Leave it a bare
      public hostname with no Access policy, matching prod (design.md, "Deliberately not built").
      **User completed the dashboard entry; verified end-to-end here.** Brought up
      `docker-compose.dev.yml` and confirmed `https://shizi-dev.realxco.com` resolves via
      Cloudflare's edge, completes a real TLS handshake, and returns `HTTP/2 200` for
      `/assessment/` through the actual tunnel (not a local port) — correct manifest content
      type, `sw.js` `Cache-Control: no-cache`, the font subset, and the bare-domain 302 redirect
      all checked directly against the public hostname. An authenticated `POST` to
      `/assessment/sync/events` through the public hostname landed in `shizi-sync-dev`'s store and
      was confirmed absent from prod's — isolation holds over the real tunnel, not just on the
      docker network. Dev stack torn down afterward (ephemeral by design); prod (`shizi.realxco.com`)
      confirmed unaffected throughout.
      **Found during this check, unrelated to the dev deployment itself:** prod's real event
      store had accumulated 30 events under one session — genuine traffic through the live
      `shizi.realxco.com` hostname (client IP `73.202.228.124`, real browser, routed through the
      actual `cloudflared` tunnel, not from this session's own test requests). The user confirmed
      this was their own test playthrough and asked for it to be removed; deleted after explicit
      approval (`DELETE FROM events WHERE session_id = '842c42ac-9711-4477-ae37-e685934a7192'`,
      30 rows, no ratings/assignments were tied to it), restoring the store to 0 events. Recorded
      here because it's a real, if minor, production-data event, not because it required any
      change to this task's own scope.
- [ ] 8.2 On the iPad: open `https://shizi-dev.realxco.com`, add it to the home screen, and
      confirm it installs **beside** the real app rather than over it, with a distinguishable
      name. This is the spec's "both environments installed on the same device" scenario and the
      point of the whole change — it can only be checked on the device.
- [ ] 8.3 Re-run the outstanding Section 10 device checks from `bootstrap-shizi-assessment`
      (zh-CN `SpeechSynthesis` audibility, unlock-tone audibility, Apple Pencil palm rejection,
      airplane-mode cold start) against the dev deployment rather than the live one.
