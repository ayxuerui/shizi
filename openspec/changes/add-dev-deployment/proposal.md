## Why

`shizi.realxco.com` is the only deployment, and it is the app Eliana actually uses. The
verification that still matters most — tasks 10.0/10.1's device-only checks: zh-CN
`SpeechSynthesis` on iPad Safari, add-to-home-screen, a full airplane-mode cold start, real
Apple Pencil palm rejection — cannot be done on a laptop and cannot be done without a real
tunneled hostname serving a real build. Today the only way to get a candidate build onto the
iPad is to point the live hostname at it, which means every verification pass happens on the
child's own app, against the canonical event store. A second, isolated deployment at
`shizi-dev.realxco.com` removes that coupling.

## What Changes

- Add a **second deployment stack** (`docker-compose.dev.yml`, project name `shizi-dev`)
  with its own gateway container (`shizi-gateway-dev`), its own sync service
  (`shizi-sync-dev`), its own shared token, and its own event-store volume. Reached at
  `shizi-dev.realxco.com` via a second Cloudflare Zero Trust public hostname — the user's own
  dashboard action, as with the existing hostname.
- **Isolate the dev event store from the canonical record.** `pull-events.ts` gains an
  explicit output-directory option and refuses to overwrite the repo-root
  `data/events/*.jsonl` — the project's actual durable backup — when run against a dev store.
- **Make dev builds identifiable on-device.** A build-time `VITE_APP_ENV=dev` flag renames the
  PWA to `shizi dev` (so the two home-screen icons are distinguishable) and renders a small
  environment badge on the unlock and diagnostics screens only — never inside the bout tree,
  preserving the assessment spec's no-score/no-failure-state guarantee.
- **Eliminate config drift between the two environments** by turning
  `infra/nginx-assessment.conf` into a single shared template rendered per stack with only the
  sync upstream differing. A dev gateway whose routing has drifted from prod's stops
  representing prod, which would defeat the point of having it.
- **Pin the production compose project name** to `shizi`. Production currently runs out of a
  throwaway git worktree, so its live event-store volume is named after that worktree
  directory. Adding a second stack alongside a project namespace that can vanish is the wrong
  foundation; this is fixed now, while no real learner data exists yet, rather than after
  Section 10's first session.

Out of scope: a third (staging) tier; a CD pipeline (`.github/workflows/ci.yml` still stops at
`build` and never deploys — deployment stays a deliberate manual act); a Cloudflare Access
policy on the dev hostname; off-site backup of either event store (still the open item flagged
in `bootstrap-shizi-assessment`'s design.md).

## Capabilities

### New Capabilities
- `deployment`: environment topology and isolation guarantees for this project's self-hosted
  stacks — how many environments exist, what each one must and must not share (hostname,
  container set, event store, shared token), how routing configuration stays identical across
  them, how a build declares which environment it was built for, and how the canonical
  repo-side event record is protected from non-production data. Behavioral requirements only;
  the concrete compose/nginx wiring is design.md's concern.

### Modified Capabilities
(none — `bootstrap-shizi-assessment`'s Section 9 built the production stack as tasks and
design decisions without ever writing an infra spec capability, and there is no
`openspec/specs/` tree yet. This change introduces `deployment` as new rather than modifying
anything.)

## Impact

- **New files**: `docker-compose.dev.yml`, `infra/sync-service/.env.dev.example`,
  `apps/assessment/.env.dev.example`, an environment-badge component under
  `apps/assessment/src/`.
- **Modified**: `docker-compose.yml` (project name, environment marker, templated nginx
  config), `infra/nginx-assessment.conf` → a template, `apps/assessment/vite.config.ts`
  (env-driven PWA manifest name), `infra/sync-service/scripts/pull-events.ts` (output guard),
  `.gitignore` (so `.env.*.example` files stay committable), `infra/README.md`.
- **One-time operational step**: the production event-store volume is copied from its
  worktree-namespaced name to `shizi_events-data`, and production is restarted from the main
  checkout rather than from `.claude/worktrees/`. Near-zero risk today (`data/events/` does not
  exist yet and the live store holds only verification data); materially riskier once real
  session data lands.
- **Manual input required from the user**: a new `shizi-dev.realxco.com` public hostname in the
  Cloudflare Zero Trust dashboard, targeting `http://shizi-gateway-dev:80`. Nothing in this
  repo can create it, exactly as with the existing hostname.
- **Host resources**: one additional published port (8082) and one additional Docker volume and
  bridge network. No new external dependencies or services.
- **No impact on the assessment app's behavior** in a production build — every change is either
  build-flag-gated or outside the app.
