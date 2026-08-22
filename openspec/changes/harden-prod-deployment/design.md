## Context

See proposal.md — Why. What constrains the approach:

- Docker here is **rootless** (`DockerRootDir: ~/.local/share/docker`). Anything under `/srv` or
  `/opt` needs sudo and puts root-owned files in front of a rootless daemon; `$HOME` is the
  natural place for deployment state.
- `shizi-sync` already demonstrates the target property. It survived the deletion of the worktree
  it was built from without anyone noticing, because it ships as an image and keeps state in a
  named volume. `shizi-gateway` did not survive that in principle — the only difference is the
  bind-mount.
- The sync shared token is **inlined into the served JavaScript** (verified: the value in
  `apps/assessment/.env` appears in `dist/assets/*.js`). It is durable-but-not-confidential.
  `bootstrap-shizi-assessment` already accepted that consciously ("shared token, not accounts").
- `apps/assessment/public/config.json` is fetched at runtime by `session/published-config.ts`,
  with a documented fallback to the bundled pool on any failure. It is derived data, regenerated
  by `infra/sync-service/scripts/publish-config.ts` on a different cadence than the app.
- `add-dev-deployment` established one shared nginx template rendered per stack, with
  `SYNC_UPSTREAM` as the only difference. That decision stands; this change only alters how
  production *obtains* the template, not what it contains.

## Goals / Non-Goals

**Goals:**
- Deleting every checkout on the host cannot take production down, before or after a restart.
- The `rm -rf dist` failure class becomes impossible rather than warned about in a README.
- Derived config stays updatable at its own cadence, without a release.

**Non-Goals:**
- Availability. This is about durability and blast radius; the host is still a single point of
  failure for uptime, exactly as `bootstrap-shizi-assessment` already accepted.
- A registry. Images stay local to this host.
- Automating the release. Deployment remains a deliberate manual act; `ci.yml` still stops at
  `build`.
- Backing up the event log. That is a separate concern with different requirements — see
  "Deliberately out of scope" below.

## Decisions

### Production serves an image; the working tree is only a build input

**Decision:** add a gateway image carrying the built application and the rendered-at-start nginx
template, replacing `docker-compose.yml`'s bind-mount of `apps/assessment/dist`. This is the
whole point of the change: it moves production from "reads a directory anyone can modify" to
"runs an artifact," which is what makes every scenario in the spec delta true.

**Multi-stage, building the app inside the image** rather than `COPY`ing a host-built `dist`.
The deploy then depends on no host toolchain state, is reproducible from a clean clone, and
matches `infra/sync-service/Dockerfile`'s existing shape (`COPY . . && npm ci`) — one mental
model for both images instead of two. Cost is a slower cold build; Docker's layer cache on
`package*.json` makes repeat builds cheap while dependencies are unchanged.

`VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN` are passed as build args. Build args are recorded in image
history, which would normally be a leak — here the token is already public in the served bundle
by construction, so there is nothing to protect. Worth stating explicitly so a future reader
doesn't try to "fix" it with a secret mount that buys nothing.

**A `.dockerignore` is required, not optional.** There is none today, so the sync build ships an
82MB context for a service whose payload is a few source files; the gateway's payload is 788K.
Adding a second image build without this makes every release absurdly slow.

### Deploy from a dedicated clone at `~/deploy/shizi`

**Decision:** a plain clone, only ever `git pull`ed on `main`, never developed in.

Rejected alternatives:
- **The main checkout** (`~/workspace/shizi`) — `git checkout other-branch` there would swap
  `docker-compose.yml` under production. Far lower stakes once nothing is bind-mounted, but it is
  the same coupling this change exists to remove.
- **A bare directory holding a copy of the compose file** — the classic drift trap: fix compose
  in git, forget to copy, and the two silently disagree.

A clone has no drift because it *is* the repo, and its location outside `workspace/` means no
session worktree can ever appear beneath it. Note what this location is and isn't: after this
change it is load-bearing for *convenience*, not uptime. Losing it means you cannot issue release
commands until you re-clone; it does not interrupt serving.

### Immutable app, mutable config — split deliberately, at the user's direction

**Decision:** the application ships in the image; `config.json` is served from a small
host-mounted location that `publish-config.ts` writes to. Confirmed directly with the user.

This is the one place the change knowingly reintroduces a host path, and it is the right
trade: config is derived data on a session-by-session cadence, and requiring an image rebuild to
publish it would put a release step inside the adaptive loop. The blast radius is bounded by
design — the spec requires that a malformed or missing config leaves the application intact and
falling back, which `published-config.ts` already does.

**Consequence to handle, not assume away:** with no `config.json` present at build time it is
absent from the service worker's precache manifest, so it becomes a runtime fetch. That is
arguably more correct for data that should be fresh, and the offline path is already covered by
the bundled-pool fallback — but it is a real behavior change from "precached like every other
asset," and `scripts/check-precache.mjs` should be checked for whether it cares.

**Found live, by actually deleting the deploy clone during task 6.4's verification, not
anticipated in the original decision above:** the host-mounted `config.json` was first placed at
a path inside the deploy clone (`apps/assessment/public/config.json`). That satisfies the
"blast radius is bounded" reasoning above only for the *file-missing-at-the-app-level* case
(`published-config.ts`'s fetch fails, falls back — true). It does **not** cover the case this
change's entire spec is actually about: the deploy clone itself disappearing. A bind mount's
*source directory* going away doesn't produce a missing file the running application can
gracefully react to — it makes the **container fail to even start** on the next restart or
recreate (`OCI runtime create failed: ... not a directory`), which is a strictly worse failure
than anything `loadPublishedConfig()`'s try/catch was written to handle. This caused a real,
if brief, production outage during this change's own verification — confirmed, then fixed
immediately (see "Risks / Trade-offs").

**Corrected decision:** `config.json`'s host path moved to `~/.config/shizi/config.json` —
outside every git working tree, the exact same durable-location treatment already given to the
shared token, rather than a second, weaker convention. `publish-config.ts` gained an `--out`
option so production can target that path explicitly while its default (repo-relative) behavior
stays unchanged for local/dev use. The original reasoning above (why config is a host mount and
not baked into the image at all) still holds; only *which* host path was wrong.

### Credentials live outside every working tree

**Decision:** `.env` files move to a durable host location (`~/.config/shizi/`), referenced by
absolute path from both compose files. The requirement is *survives deletion*, not *resists
reading* — see Context on the token being public already.

**Flagged, not solved here:** the token must stay the value the currently released app was built
against. Rotating it is therefore a two-step operation (change the server value, release a new
app build), and clients holding queued events built against the old value will 401 until they get
the new build. The spec states the coupling; the rotation procedure belongs in `infra/README.md`.
Nothing in this repo should hold the value — a password manager is the right home for the only
other copy.

### Rollback: date-tagged images, no retention machinery

The user did not express a preference when asked twice, so this is a judgment call, stated
plainly so it can be overridden cheaply. **Decision:** tag each release
(`shizi-gateway:YYYY-MM-DD`) in addition to `latest`, and leave pruning manual.

Tagging is nearly free and satisfies the spec's "returning to the previous release" scenario;
a retention policy, a `releases/` directory, or a symlink-swap scheme is machinery a
single-family tool does not need yet. If image sprawl ever becomes real, `docker image prune`
by date is the answer, not a new abstraction.

### An ambiguity this change exposes in the spec it modifies

`deployment`'s existing "A routing rule is corrected" scenario says a change "SHALL take effect
in every environment without being restated per environment." With production serving an image,
a routing fix reaches production on release rather than on restart.

**Reading adopted:** satisfied. There is still exactly one template file in git; both environments
derive from it; nothing is restated. Requiring a release to ship a change is ordinary release
discipline and is already true of the application itself.

This is worth recording rather than quietly deciding, because that scenario was written (in
`add-dev-deployment`, one session earlier) before this question existed, and a reader could take
it the other way. If the stricter reading is ever preferred, the fix is to keep the template
bind-mounted from the deploy clone instead of baking it — at the cost of one host path.

### Deliberately out of scope

- **Backing up the event log.** Different failure mode, different requirements (durability and
  recoverability rather than deployment coupling), and it turns on facts this change does not
  touch: the export is byte-stable and append-only, `main` is unprotected, and a git credential
  helper is already wired. It deserves its own change.
- **Committing the currently-uncommitted work.** Everything from the `add-dev-deployment` session
  lives only in the at-risk worktree. That is the same failure one layer up, and it is hygiene
  rather than design — it should happen before this change is implemented, since this change
  edits the same files.

## Risks / Trade-offs

- **Cold image builds are slow** → the multi-stage build runs `npm ci`; the sync image already
  showed this taking long enough to exceed a two-minute command timeout. Mitigated by layer
  caching on `package*.json` and by a `.dockerignore`; accepted because releases are infrequent
  and deliberate.
- **A release now has more steps than a restart** → `git pull`, build, `up -d` instead of build,
  restart. Accepted: the extra step is precisely what makes the artifact immutable. It must be
  documented as a single copy-pasteable sequence in `infra/README.md` or it will be got wrong.
- **The config mount is a remaining host dependency** → bounded deliberately (see above), but it
  means "no host paths at all" is not literally true after this change. The spec is written to
  match what is actually built: production must keep *serving* with no checkout present, which
  holds because a missing config falls back.
- **Materialized as a real, if brief, production outage during this change's own verification** →
  task 6.4's test (delete the deploy clone entirely, restart the gateway) was written to prove
  exactly this risk was handled — and the first time it actually ran, it wasn't: the config mount
  originally lived inside the deploy clone, so deleting it left the gateway container unable to
  even start on restart (502, not a graceful degrade). Restored immediately by putting the clone
  back; root-caused and fixed by moving the mount source to `~/.config/shizi/config.json` (see
  "Immutable app, mutable config" above). Recorded here rather than quietly patched, because it's
  a real demonstration of exactly the failure category this whole change exists to prevent,
  caught by actually running the destructive test rather than reasoning about it on paper.
- **Moving `.env` is the one step that can break production if fumbled** → its current copy is the
  only one on disk, though the running container still holds the value in its environment.
  Capture the value first, verify the new location, and only then recreate the container.
- **`enable-linger` is easy to forget** → not this change's problem directly, but the same class of
  omission: a user-level unit that silently doesn't run when nobody is logged in. Relevant when the
  backup change lands.
