## 0. Prerequisite, outside this change's scope

- [x] 0.1 Commit and push the `add-dev-deployment` session's work (dev stack, templated nginx,
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

- [x] 1.1 Add a `.dockerignore` at the repo root excluding at minimum `node_modules/`, `.git/`,
      `.claude/`, `dist/`, `spikes/`, `coverage/`, `*.tsbuildinfo`, and `openspec/`. There is none
      today, so the existing sync build ships an 82MB context.
      **Found while doing this, not assumed:** the *currently running* `shizi-sync` image already
      has `.env` files baked into its filesystem layer (`COPY . .` with no `.dockerignore` copies
      whatever's on disk, gitignored or not) — confirmed directly:
      `/repo/infra/sync-service/.env` and `/repo/apps/assessment/.env` both present inside the
      live container. Not a severity escalation (the matching `VITE_SYNC_TOKEN` is already public
      in the served JS bundle by this project's own shared-token design), but worth closing rather
      than repeating in the new gateway image. Added explicit `.env`/`.env.*` exclusions (with the
      `.env.*.example` negation, matching `.gitignore`'s own pattern) beyond what this task
      originally listed.
      **Found and fixed a second issue in the same step:** a bare `.dockerignore` pattern like
      `.env` (no `/`) only matches at the build-context ROOT in Docker's ignore semantics, unlike
      `.gitignore`'s implicit recursion — it did not exclude the nested `infra/sync-service/.env`
      or `apps/assessment/.env` at all. Caught by actually checking the built image's filesystem,
      not by reading the pattern and assuming it worked. Fixed with explicit `**/.env`/`**/.env.*`
      (and `**/node_modules/`, `**/dist/`) forms, which do match at any depth.
- [x] 1.2 Verify the effect on the existing image before adding a second one: rebuild
      `shizi-sync` and confirm the reported build context drops from ~82MB to single-digit MB,
      and that the rebuilt image still starts and answers `/health`. Confirmed: 82MB → 2.4MB;
      rebuilt image confirmed free of the baked `.env` files from 1.1's finding; started with a
      throwaway token and `GET /health` → `{"status":"ok"}`. **Not yet redeployed live** — the
      running `shizi-sync` container still serves the pre-fix image (harmless, not a live risk,
      but not the point of this fix either); folded into section 5's cutover as an additional
      step rather than recreating it here mid-section-1.

## 2. Gateway image

- [x] 2.1 Add a multi-stage Dockerfile for the gateway: a `node:22` stage running `npm ci` and the
      assessment build, then an `nginx:1.27-alpine` stage receiving the built app and
      `infra/nginx-assessment.conf.template` at `/etc/nginx/templates/`. Node 22 is load-bearing
      elsewhere in this repo (`better-sqlite3`); keep it consistent. `infra/gateway.Dockerfile`,
      mirroring `infra/sync-service/Dockerfile`'s shape exactly (design.md's "one mental model").
      **Found and fixed while getting this to actually build, not assumed to work from the
      Dockerfile alone:** the same "bare pattern only matches the context root" gotcha from
      task 1.1 recurred for `*.tsbuildinfo` — nested `packages/*/tsconfig.tsbuildinfo` files
      (real, left over from this session's own manual host builds) were NOT excluded, which
      silently broke the build in a confusing way: `tsc -b` read the stale build-info, believed
      each workspace package was already built, and no-opped — while `**/dist/` correctly *had*
      excluded the actual `dist/` output those buildinfo files claimed existed. The result was
      `apps/assessment`'s own build failing with `TS6305` errors pointing at `dist/index.d.ts`
      files that didn't exist. Fixed with `**/*.tsbuildinfo`; verified by building just the `deps`
      stage and confirming zero stale `dist/`/`.tsbuildinfo` files reach the container before
      trusting the full build. `.dockerignore` now documents both this and the earlier `.env`
      gotcha inline, since it's now happened twice with the same root cause.
- [x] 2.2 Accept `VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN` as build args and document in the
      Dockerfile itself why build-arg exposure is acceptable here (the token is already inlined
      into the served bundle — see design.md), so nobody later replaces it with a secret mount
      that buys nothing. Verified: built with the real production token as a build arg, confirmed
      it lands in the served bundle (expected — that's the existing client-side design, not new
      exposure) and confirmed no `.env` file reaches the image (`.dockerignore`'s `**/.env`).
- [x] 2.3 Rewrite `docker-compose.yml`'s `gateway` to build this image rather than bind-mount
      `./apps/assessment/dist` and the template. Keep `SYNC_UPSTREAM`/`NGINX_ENVSUBST_FILTER`
      exactly as they are — the rendered config must not change.
      **Correction made during implementation, not shipped wrong:** the first draft kept the
      nginx template ALSO bind-mounted (for "convenience"), redundant with the image's own baked
      copy. That's actively wrong, not just untidy — `envsubst` only runs once, at container
      start, so a bind-mounted template means a NEW container start still depends on that host
      path existing, defeating the entire point once the deploy clone is gone (task 6.4's exact
      scenario would fail). Removed; the template now comes from the image only. `config.json`
      stays a deliberate, narrow bind-mount (task 3.1) — different case, see there.
      Verified: `docker compose build gateway` succeeds; a container run from the resulting image
      renders a config identical to the live production gateway's (diff is two comment lines
      reflecting a rename from earlier in this session, not a functional difference);
      `/assessment/`, `/`, the manifest, `sw.js`'s cache header, the font, and
      `/assessment/sync/health` all round-trip correctly against the real running `sync`
      service.
- [x] 2.4 Leave `docker-compose.dev.yml` bind-mounting the working tree, and add a comment saying
      the asymmetry with production is deliberate and must not be "fixed" (the spec's
      "Non-production may serve directly from a working tree" requirement). Also corrected its
      comment claiming the nginx template is "the SAME template file prod's gateway mounts" —
      no longer true after 2.3; now says baked into prod's image instead.
- [x] 2.5 Tag releases `shizi-gateway:YYYY-MM-DD` alongside `latest`. No retention policy, no
      `releases/` scheme — see design.md's rollback decision. `docker tag shizi-gateway:latest
      shizi-gateway:2026-08-21`.

## 3. Config split

- [x] 3.1 Serve `config.json` from a host-mounted location rather than from inside the image, so
      regenerating it needs no release. Mount it narrowly — a directory containing only that file,
      not the whole served root, so it cannot shadow application assets. Implemented as a direct
      file-to-file bind mount, equally narrow for this one file, and avoiding a second,
      differently-shaped host path convention.
      **Superseded during task 6.4's own verification, not left as originally shipped:** the
      first location chosen was `./apps/assessment/public/config.json` inside the deploy clone —
      which turned out to violate this very change's central guarantee. Deleting the deploy
      clone (task 6.4's exact scenario) left the mount source gone, and the gateway container
      failed to even **start** on the next restart — a real, brief production outage, caught by
      actually running the destructive test, not by reasoning about it on paper. Moved to
      `~/.config/shizi/config.json` — outside every git working tree, the same treatment already
      given the shared token — and re-verified (see 6.4's updated notes). Full account in
      design.md's "Immutable app, mutable config" entry.
      Added `.dockerignore`/`.gitignore` entries for the (now superseded, but still harmless to
      leave gitignored for local/dev use) in-repo path, and `touch`ed a placeholder file at the
      real durable location so the mount source exists (a missing host file makes Docker create
      an empty DIRECTORY there instead — see 3.4's live-tested proof that this degrades safely
      anyway, but a real file avoids the confusing state altogether).
- [x] 3.2 Point `publish-config.ts` at that location (or document the copy step), and confirm the
      served URL is unchanged from the client's perspective — `published-config.ts` fetches
      `${BASE_URL}config.json` and must keep working untouched.
      **Revised along with 3.1's correction:** a script change WAS needed after all — added an
      `--out <path>` option so production can target `~/.config/shizi/config.json` explicitly,
      while the default (repo-relative) behavior stays exactly as it was for local/dev use.
      Verified both branches directly: `--out /tmp/...` writes there; no `--out` still writes the
      original repo-relative path. Served URL (`/assessment/config.json`) unchanged either way —
      nginx's `alias`-based `/assessment/` location block resolves it through whichever file is
      bind-mounted at that container path, unaffected by this change.
      **Found while doing this:** the config.json path was not previously gitignored despite now
      being pure runtime-generated output — added to `.gitignore` so the deploy clone's `git
      status` stays clean and it can never get accidentally `git add -A`'d.
- [x] 3.3 Check `apps/assessment/scripts/check-precache.mjs`: `config.json` will now be absent at
      build time and therefore absent from the precache manifest. Confirm the guard doesn't assert
      on it, and decide explicitly whether a runtime-fetched config is acceptable (design.md says
      yes, given the bundled-pool fallback) rather than discovering it later. Confirmed:
      `REQUIRED_SUBSTRINGS` lists only the font subset, `OFL.txt`, the three icons, and the two
      placeholder audio clips — no `config.json` reference exists, so nothing to update. The real
      gateway build (task 2.1's verification) already ran this exact check and passed. Runtime-fetch
      is accepted per design.md's reasoning, now backed by 3.4's live proof of the fallback path.
- [x] 3.4 Prove the spec's failure scenarios: with the config file absent, and again with it
      truncated/malformed, the app still loads and falls back to the bundled pool. Tested against
      the real built image (not just `published-config.test.ts`'s existing unit coverage) in three
      states: (a) mounted file present but empty → `200 OK`, empty body, client's `response.json()`
      throws → falls back; (b) mounted file present but truncated JSON → `200 OK`, unparseable body
      → falls back; (c) **the risky one** — host path never created at all: Docker mounts an empty
      DIRECTORY at that container path exactly as design.md warned, nginx responds `301` (treating
      it as a directory), and following that redirect (as browser `fetch()` does automatically)
      lands on `403 Forbidden` — still `!response.ok`, so the existing fallback fires correctly in
      every case with zero application-code changes needed. This is why a placeholder file is
      recommended (3.1) rather than strictly required: the failure mode was already safe, just
      uglier to debug.

## 4. Durable credentials

- [x] 4.1 Create `~/.config/shizi/` and move the production `.env` there. Capture the value first
      (task 0.2) — its current copy is the only one on disk. `~/.config/shizi/` (0700) +
      `prod.env` (0600), consolidating `SYNC_SHARED_TOKEN` and `VITE_SYNC_TOKEN` into one file
      since they're deliberately the same shared-token value (confirmed they already matched
      before consolidating). This closes a gap the task list didn't originally anticipate: the
      gateway's build now needs `VITE_SYNC_TOKEN` as a shell-exported build arg (task 2's own
      design), not just something an `env_file:` supplies to a container — one file serves both
      purposes rather than inventing a second convention.
- [x] 4.2 Point both compose files' `env_file` at absolute paths under that directory, and confirm
      `docker compose config` resolves for both stacks. `docker-compose.yml`'s `sync` →
      `/home/ubuntu/.config/shizi/prod.env`; `docker-compose.dev.yml`'s `sync-dev` →
      `.../dev.env`. Verified: both `docker compose config --quiet` calls resolve cleanly once
      each file exists, and fail with the same "env file not found" error as before if it doesn't
      (no new failure mode introduced, just a new path).
- [x] 4.3 Document the token-rotation coupling in `infra/README.md`: changing the server-side value
      requires a new app release built against it, and clients holding queued events will get 401s
      until they receive that build. Added a "Credentials: `~/.config/shizi/`" section covering
      creation, the two ways the file is used, and the rotation coupling explicitly. Also replaced
      the now-stale `Setup` steps 1-2 (which described copying repo-relative `.env.example` files
      that the compose files no longer read at all).

## 5. Deploy clone and release procedure

- [x] 5.1 Create `~/deploy/shizi` as a plain clone of `main`. Never develop in it; it exists only
      to run releases. Under `$HOME`, not `/srv` — Docker here is rootless (design.md).
      Sequenced after this change's own code actually reached `main` (PR #11, merged) — asked the
      user explicitly rather than assuming, since deploying from a clone that DIDN'T yet have
      this change's own code would have reintroduced exactly the coupling-to-an-ephemeral-branch
      problem this change exists to remove. `git clone` (not a worktree) into `/home/ubuntu/deploy/shizi`,
      confirmed on `main` at the merge commit.
- [x] 5.2 Cut production over: release from the deploy clone, confirm `shizi-gateway` is running
      the image (no bind-mounts for app content), and confirm the site serves. Also recreate
      `shizi-sync` from the deploy clone at the same time, so it picks up task 1.1's
      `.dockerignore` fix (the currently running sync image still has `.env` baked into its layer
      from before that fix existed) — no reason to leave that in place once a cutover is
      happening anyway.
      Real cutover performed, against the real live production stack, event count recorded
      before (0) and confirmed unchanged after. `source`d `~/.config/shizi/prod.env`,
      `docker compose build gateway sync`, tagged `shizi-gateway:2026-08-22`, `docker compose up
      -d gateway sync`. Verified: `shizi-gateway` now runs `shizi-gateway:latest` with its ONLY
      mount being the deliberate `config.json` bind (no app content, no template — both are baked
      in); `shizi-sync` runs the fixed image (confirmed `.env` no longer present inside it);
      `https://shizi.realxco.com/assessment/` serves 200 with the correct manifest/cache-header/
      sync-health through the real public hostname; an authenticated event POST using the
      durable-location token round-trips (`{"inserted":0}` — an intentionally empty test body,
      not a real event); compose project label still reads `shizi`. **This is now the actual
      live production deployment**, not a side experiment.
- [x] 5.3 Document the release sequence in `infra/README.md` as one copy-pasteable block
      (`git pull` → build → `up -d`), plus the rollback command using a previous date tag. If this
      isn't a single block, it will be got wrong. Added as "Releasing a new version"; the exact
      block documented is the one actually used for 5.2's real cutover, not a theoretical one —
      each line was run for real and worked as written.
- [x] 5.4 Update `infra/README.md`'s existing "Do not `rm -rf apps/assessment/dist`" warning: that
      hazard no longer applies to production once it serves an image, but it still applies to the
      dev stack, which keeps its bind-mount. Folded into the "Releasing a new version" section:
      states the hazard is now dev-specific and explains why (image vs. bind-mount).

## 6. Verification

Each item maps to a scenario in `specs/deployment/spec.md`.

- [x] 6.1 `npm run lint && npm run typecheck && npm run test && npm run build` across the
      workspace. All pass: lint clean, typecheck clean across all 8 packages, 378/378 tests,
      full build succeeds. **Found while running this, not a regression:** a host-side build
      precaches `config.json` (17 entries, up from 16) since the placeholder file exists on disk
      here and Vite's `workbox.globPatterns` includes `json`. Confirmed this is benign and
      specific to host/dev builds — the actual gateway IMAGE build never sees the file at all
      (`.dockerignore`), so its `sw.js` correctly has no `config.json` reference; verified by
      grepping the real built image directly. No design violation: dev's `dist/` is rebuilt fresh
      each verification pass anyway and never claimed the "update without rebuild" property this
      change gives production specifically.
- [x] 6.2 **Rendered-config parity is preserved:** dump `/etc/nginx/conf.d/default.conf` from the
      image-based prod gateway and from a running dev gateway; the only difference must still be
      the sync upstream. This is the check that proves baking the template changed nothing
      observable. Confirmed against the real live (now image-based) `shizi-gateway` and a
      throwaway dev-flavored container rendering the same template file: one-line diff, exactly
      `sync` vs `sync-dev`.
- [x] 6.3 **The `rm -rf dist` class is dead:** delete `apps/assessment/dist` in the deploy clone,
      then restart `shizi-gateway`, and confirm production still serves. Under the old bind-mount
      this produced a real four-minute outage. Confirmed against the real live production
      deployment, twice — once before task 6.4's finding, once after the fix: `rm -rf` the
      deploy clone's `dist/`, restart, still 200 throughout.
- [x] 6.4 **No checkout, still serving:** with prod running, move or rename the deploy clone, then
      restart the gateway and confirm it still serves the application and `/assessment/sync/*`.
      Restore the clone afterward. This is the spec's "Every checkout on the host is deleted"
      scenario and the whole point of the change.
      **This is the check that found the real bug** (see design.md's "Immutable app, mutable
      config" and the risks entry it links). First run: moved the deploy clone aside, restarted
      `shizi-gateway` → **502**, a real (brief) production outage, because `config.json`'s mount
      source lived inside that clone. Restored immediately, root-caused, fixed in a follow-up PR
      (#12: moved the mount to `~/.config/shizi/config.json`), merged, pulled into the deploy
      clone, redeployed. **Re-run for real after the fix:** moved the ENTIRE deploy clone away
      (confirmed gone from disk), restarted BOTH `shizi-gateway` and `shizi-sync` — `200` on
      `/assessment/`, `{"status":"ok"}` on `/assessment/sync/health`, correct manifest name. This
      now genuinely passes, not just on paper.
- [x] 6.5 **Config updates without a release:** change `config.json` in place, confirm the running
      deployment serves the new content with no rebuild and no container recreate. Confirmed
      under the strongest possible condition — WHILE the deploy clone was still fully deleted
      (task 6.4's live state): edited `~/.config/shizi/config.json` in place, added a marker
      field, confirmed it appeared in the live served response immediately with no rebuild/
      recreate; reverted, confirmed the marker disappeared immediately.
- [x] 6.6 **Rollback works:** bring up the previous date-tagged image and confirm it serves, then
      return to current. **Found while testing this:** the first attempt (re-tagging
      `2026-08-21` as `latest`) was a false verification — Docker's build cache had produced the
      IDENTICAL image ID for every date tag so far (nothing in the image's actual build content
      had changed across those tags; only the compose file's mount path had), so "rolling back"
      swapped nothing real. Built a genuinely distinct image (`--build-arg
      VITE_SYNC_TOKEN=ROLLBACK-TEST-MARKER-VALUE`, a different image ID), swapped `latest` to it,
      confirmed the marker string was actually present in the live served JS bundle (real content
      change, not just a tag pointer), then swapped back to the real current release and
      confirmed the marker was gone again. Rollback mechanism now genuinely proven, not just
      exercised.
- [x] 6.7 **Credentials survive:** run `git clean -xfd` in the deploy clone, then recreate the sync
      container and confirm it still starts and still authenticates a request from the currently
      released build. Confirmed: `git clean -xfd` removed `node_modules/` and the (unused, since
      the fix) in-clone `config.json` placeholder; `docker compose build sync` still succeeded
      (the Dockerfile's own `npm ci` never depended on host `node_modules`); recreated container
      started and an authenticated event POST using the `~/.config/shizi/prod.env` token
      round-tripped `200`.
- [x] 6.8 **Event store untouched throughout:** record the event count before starting section 5
      and confirm it is unchanged at the end. Real learner data may exist by the time this is
      implemented — treat the store as production data, not test data. Checked at every single
      step of the real cutover and every destructive test in section 6 (before/after each of
      6.3's `rm -rf`, 6.4's clone deletion — twice, including the outage — 6.6's rollback swaps,
      and 6.7's `git clean -xfd`): **0 events, 0 ratings throughout, no exceptions.** No real
      learner data existed yet at any point during this change's implementation.
