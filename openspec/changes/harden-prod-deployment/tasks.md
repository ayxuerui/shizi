## 0. Prerequisite, outside this change's scope

- [ ] 0.1 Commit and push the `add-dev-deployment` session's work (dev stack, templated nginx,
      canonical-record guard, the synced `deployment` main spec, and this change's own artifacts).
      All of it currently exists only in
      `.claude/worktrees/bridge-cse_01WEvjnbbXmpPwEVch6z8aJi/`, whose sibling worktree was already
      deleted mid-session. This change edits the same files, so it must land on top of committed
      work rather than alongside uncommitted work.
- [ ] 0.2 Record the current `SYNC_SHARED_TOKEN` value somewhere durable and off this machine (a
      password manager). Its only on-disk copy is in the at-risk worktree; the running
      `shizi-sync` container still holds it in its environment, which is the recovery path if that
      file is lost before task 4 moves it. Nothing in this repo should store it.

## 1. Build context hygiene (do first — both image builds depend on it)

- [ ] 1.1 Add a `.dockerignore` at the repo root excluding at minimum `node_modules/`, `.git/`,
      `.claude/`, `dist/`, `spikes/`, `coverage/`, `*.tsbuildinfo`, and `openspec/`. There is none
      today, so the existing sync build ships an 82MB context.
- [ ] 1.2 Verify the effect on the existing image before adding a second one: rebuild
      `shizi-sync` and confirm the reported build context drops from ~82MB to single-digit MB,
      and that the rebuilt image still starts and answers `/health`.

## 2. Gateway image

- [ ] 2.1 Add a multi-stage Dockerfile for the gateway: a `node:22` stage running `npm ci` and the
      assessment build, then an `nginx:1.27-alpine` stage receiving the built app and
      `infra/nginx-assessment.conf.template` at `/etc/nginx/templates/`. Node 22 is load-bearing
      elsewhere in this repo (`better-sqlite3`); keep it consistent.
- [ ] 2.2 Accept `VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN` as build args and document in the
      Dockerfile itself why build-arg exposure is acceptable here (the token is already inlined
      into the served bundle — see design.md), so nobody later replaces it with a secret mount
      that buys nothing.
- [ ] 2.3 Rewrite `docker-compose.yml`'s `gateway` to build this image rather than bind-mount
      `./apps/assessment/dist` and the template. Keep `SYNC_UPSTREAM`/`NGINX_ENVSUBST_FILTER`
      exactly as they are — the rendered config must not change.
- [ ] 2.4 Leave `docker-compose.dev.yml` bind-mounting the working tree, and add a comment saying
      the asymmetry with production is deliberate and must not be "fixed" (the spec's
      "Non-production may serve directly from a working tree" requirement).
- [ ] 2.5 Tag releases `shizi-gateway:YYYY-MM-DD` alongside `latest`. No retention policy, no
      `releases/` scheme — see design.md's rollback decision.

## 3. Config split

- [ ] 3.1 Serve `config.json` from a host-mounted location rather than from inside the image, so
      regenerating it needs no release. Mount it narrowly — a directory containing only that file,
      not the whole served root, so it cannot shadow application assets.
- [ ] 3.2 Point `publish-config.ts` at that location (or document the copy step), and confirm the
      served URL is unchanged from the client's perspective — `published-config.ts` fetches
      `${BASE_URL}config.json` and must keep working untouched.
- [ ] 3.3 Check `apps/assessment/scripts/check-precache.mjs`: `config.json` will now be absent at
      build time and therefore absent from the precache manifest. Confirm the guard doesn't assert
      on it, and decide explicitly whether a runtime-fetched config is acceptable (design.md says
      yes, given the bundled-pool fallback) rather than discovering it later.
- [ ] 3.4 Prove the spec's failure scenarios: with the config file absent, and again with it
      truncated/malformed, the app still loads and falls back to the bundled pool.

## 4. Durable credentials

- [ ] 4.1 Create `~/.config/shizi/` and move the production `.env` there. Capture the value first
      (task 0.2) — its current copy is the only one on disk.
- [ ] 4.2 Point both compose files' `env_file` at absolute paths under that directory, and confirm
      `docker compose config` resolves for both stacks.
- [ ] 4.3 Document the token-rotation coupling in `infra/README.md`: changing the server-side value
      requires a new app release built against it, and clients holding queued events will get 401s
      until they receive that build.

## 5. Deploy clone and release procedure

- [ ] 5.1 Create `~/deploy/shizi` as a plain clone of `main`. Never develop in it; it exists only
      to run releases. Under `$HOME`, not `/srv` — Docker here is rootless (design.md).
- [ ] 5.2 Cut production over: release from the deploy clone, confirm `shizi-gateway` is running
      the image (no bind-mounts for app content), and confirm the site serves.
- [ ] 5.3 Document the release sequence in `infra/README.md` as one copy-pasteable block
      (`git pull` → build → `up -d`), plus the rollback command using a previous date tag. If this
      isn't a single block, it will be got wrong.
- [ ] 5.4 Update `infra/README.md`'s existing "Do not `rm -rf apps/assessment/dist`" warning: that
      hazard no longer applies to production once it serves an image, but it still applies to the
      dev stack, which keeps its bind-mount.

## 6. Verification

Each item maps to a scenario in `specs/deployment/spec.md`.

- [ ] 6.1 `npm run lint && npm run typecheck && npm run test && npm run build` across the
      workspace.
- [ ] 6.2 **Rendered-config parity is preserved:** dump `/etc/nginx/conf.d/default.conf` from the
      image-based prod gateway and from a running dev gateway; the only difference must still be
      the sync upstream. This is the check that proves baking the template changed nothing
      observable.
- [ ] 6.3 **The `rm -rf dist` class is dead:** delete `apps/assessment/dist` in the deploy clone,
      then restart `shizi-gateway`, and confirm production still serves. Under the old bind-mount
      this produced a real four-minute outage.
- [ ] 6.4 **No checkout, still serving:** with prod running, move or rename the deploy clone, then
      restart the gateway and confirm it still serves the application and `/assessment/sync/*`.
      Restore the clone afterward. This is the spec's "Every checkout on the host is deleted"
      scenario and the whole point of the change.
- [ ] 6.5 **Config updates without a release:** change `config.json` in place, confirm the running
      deployment serves the new content with no rebuild and no container recreate.
- [ ] 6.6 **Rollback works:** bring up the previous date-tagged image and confirm it serves, then
      return to current.
- [ ] 6.7 **Credentials survive:** run `git clean -xfd` in the deploy clone, then recreate the sync
      container and confirm it still starts and still authenticates a request from the currently
      released build.
- [ ] 6.8 **Event store untouched throughout:** record the event count before starting section 5
      and confirm it is unchanged at the end. Real learner data may exist by the time this is
      implemented — treat the store as production data, not test data.
