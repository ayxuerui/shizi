## 1. Fixed host path for the event store

- [x] 1.1 Create `~/.local/share/shizi/sync-data/` (0755) as the new durable location, distinct
      from `~/.config/shizi/` (config/secrets) — see design.md's naming-convention decision.
- [x] 1.2 Record the current event/rating/assignment counts from the live store (expected: 0/0/0
      at time of writing, but re-check at implementation time — real sessions may have happened
      by then, in which case treat this as production data, not test data). Re-confirmed at
      implementation time: still 0/0/0.
- [x] 1.3 Stop the `sync` container (`docker compose stop sync`, not `down`) so SQLite checkpoints
      its WAL into `events.sqlite` rather than leaving a mid-write `-wal`/`-shm` pair to copy.
- [x] 1.4 Copy the `events-data` named volume's contents into the new host path with a throwaway
      container; verify every file's `md5sum` matches between source and destination, not just a
      directory listing. Confirmed: `events.sqlite`, its `-wal`/`-shm`, and all 14 backup
      snapshot files under `backups/` produced identical checksums on both sides.
- [x] 1.5 Update `docker-compose.yml`'s `sync` service: replace the `events-data:` named-volume
      mount with a bind mount to `~/.local/share/shizi/sync-data/` (absolute host path, matching
      the durable-secrets convention's use of absolute paths rather than `${HOME}` expansion).
      Leave `EVENTS_DB_PATH`/`BACKUP_DIR` (the in-container paths) unchanged. `docker compose
      config --quiet` confirmed clean; the now-unused top-level `events-data:` volume
      declaration removed along with it.
- [x] 1.6 Bring `sync` back up from the deploy clone; confirm the counts from 1.2 are unchanged,
      and confirm an authenticated event POST still round-trips end to end. Confirmed against
      the real live production deployment: mount is now `/home/ubuntu/.local/share/shizi/
      sync-data -> /repo/infra/sync-service/data`; counts still 0/0/0; `/assessment/sync/health`
      → ok; an authenticated event POST round-tripped `{"inserted":0}`; the SQLite file is now
      directly `ls`-able at the fixed host path with no `docker volume inspect` step.
- [x] 1.7 Leave the original `events-data` volume in place, untouched, as the rollback path — do
      not delete it as part of this change.
- [x] 1.8 Update `docker-compose.dev.yml`'s comment on `dev-events-data` to state explicitly that
      it deliberately stays a named volume (the spec's "Non-production's event store is exempt"
      requirement) — do not change its actual configuration. Configuration itself untouched;
      `docker compose -f docker-compose.dev.yml config --quiet` still resolves cleanly.

## 2. Backup script

- [x] 2.1 Simplify `infra/sync-service/scripts/pull-events.ts`'s default `EVENTS_DB_PATH`
      resolution now that the host path is fixed — document the new default in the script's own
      header comment; keep the existing `--out-dir`/`SHIZI_ENV=dev` guard from `add-dev-
      deployment` untouched. Default now `/home/ubuntu/.local/share/shizi/sync-data/
      events.sqlite`. Verified: ran with no arguments and no `EVENTS_DB_PATH`, confirmed it read
      the real live store directly; `data/events/` in this checkout confirmed untouched
      (used `--out-dir` for the smoke test). `pull-events.test.ts`'s 7 tests unaffected (they
      always pass an explicit dbPath).
- [x] 2.2 Add a small wrapper script (e.g. `scripts/backup-and-push.sh`, run from the deploy
      clone) that: runs the export against the fixed path from 1.1 (no `docker volume inspect`
      step needed anymore); checks the clone for uncommitted changes outside `data/events/` and
      refuses to proceed if any exist (spec's "commits only the canonical export"); commits only
      if the export actually changed something, otherwise leaves evidence it ran (spec's
      "distinguishable from silence" — e.g. an append to a small run-log file) rather than doing
      nothing silently; pushes.
      **Written as TypeScript (`backup-and-push.ts`), not bash as originally sketched** — matches
      this package's own "extract the decision logic, keep the entrypoint thin" convention
      (`pull-events.ts`), makes task 2.3's unit tests natural instead of awkward, and reuses
      `pullEvents` directly rather than shelling out to `npx tsx pull-events.ts` from inside a
      shell script. `runBackup()` deliberately never pushes itself — the CLI entrypoint does that
      as its own last step — so tests exercise the full export/log/commit sequence against a real
      scratch git repo with no real remote needed. Evidence-of-run lives in
      `data/events/backup-log.txt`, appended every run (not just when data changed) — chosen over
      an empty commit specifically because `git log -- data/events/` is a PATH-scoped log, and an
      empty commit touching no files under that path would be invisible to exactly the health
      check task 6.7/design.md's self-observable-health decision relies on.
- [x] 2.3 Unit-test the wrapper's dirty-clone refusal and its "commits only the export files"
      behavior against a scratch git repo, matching `pull-events.test.ts`'s existing approach.
      `backup-and-push.test.ts`, 6 tests against a real scratch git repo (`git init` in a temp
      dir, not mocked — same philosophy `db.test.ts`/`pull-events.test.ts` already use for real
      SQLite): the guard passes clean, throws on unrelated dirt, doesn't throw for committed
      changes; `runBackup` refuses and commits nothing when dirty, commits real data with the
      correct message/log line, and — the scenario that actually matters — a SECOND run against
      unchanged data still produces a new commit (proving "ran, found nothing" is distinguishable
      from a stalled job) while `events.jsonl` stays byte-identical. All 48 sync-service tests
      pass; lint and typecheck clean.

## 3. Durable push credential

- [x] 3.1 Create a fine-grained GitHub PAT (or deploy key) scoped to `contents:write` on this
      repository only — not the interactive `gh auth` login already used elsewhere on this
      machine.
      **Used the deploy-key alternative, not a PAT** — creating a fine-grained PAT has no API;
      it's a GitHub web-UI-only flow requiring the user's own browser session, which this
      workflow cannot drive. A deploy key IS creatable programmatically (`gh api
      repos/.../keys`) and is arguably the better fit anyway: it's inherently scoped to this one
      repository, not account-wide. Generated an ed25519 keypair
      (`~/.config/shizi/deploy-key{,.pub}`, no passphrase — appropriate for unattended cron use)
      and registered the public half with `read_only: false` (write access) via the GitHub API,
      using the already-authenticated `gh` CLI's admin access to this repo.
- [x] 3.2 Store it in `~/.config/shizi/` alongside the existing durable secrets — one place
      operators already know to check. Record a copy in a password manager.
      Private key at `~/.config/shizi/deploy-key` (0600), public half at `.pub` (0644, not
      sensitive — it's already registered with GitHub). **Recording it in a password manager is
      the user's own action** — same as `harden-prod-deployment`'s task 0.2 for the sync token; I
      have no password-manager access. Unlike that token, this key is not embedded in anything
      served publicly, so losing the only copy would mean generating and re-registering a new
      one (a few-minute fix), not a security exposure — lower urgency than the sync token, but
      still worth a durable off-machine copy.
- [x] 3.3 Configure the deploy clone's git remote (or the wrapper script directly) to push using
      this credential, independent of any `gh`-managed helper. `origin` switched to the SSH URL
      (`git@github.com:ayxuerui/shizi.git`); `core.sshCommand` set LOCALLY in the deploy clone
      (not globally) to `ssh -i ~/.config/shizi/deploy-key -o IdentitiesOnly=yes`, scoping this
      identity to that one clone. Verified: `git fetch` succeeded with no interactive prompt and
      no dependency on the `gh` credential helper; push verification folds into task 4.3's real
      triggered run.

## 4. Cron installation

**Revised mid-implementation, at the user's explicit direction:** tasks 4.1/4.2 originally called
for a host crontab entry following this host's `pkm-maintenance` idiom. That version was fully
built and verified (a real `flock`-guarded, tagged entry installed idempotently, a byte-for-byte
diff proving every `pkm-maintenance` line was untouched) — then reverted in favor of a
dockerized cron daemon instead, for the same "inspectable with ordinary Docker tooling" reasoning
already applied to every other piece of this project's infrastructure. See design.md's "A cron
daemon inside a container, not a host crontab entry" for the full account, including why it isn't
presented as though the container approach were the only one ever considered.

- [x] 4.1 (Superseded task text: "write the crontab entry...") Instead: `infra/backup-cron.Dockerfile`
      (`node:22-bookworm-slim` + `git`/`openssh-client`/`cron`/the native-build toolchain
      `better-sqlite3` needs, matching `infra/sync-service/Dockerfile`'s own requirement;
      `ssh-keyscan github.com` baked in at build time) and `infra/backup-cron/crontab` — the
      version-controlled, `/etc/cron.d/`-installed schedule, redirecting output to
      `/proc/1/fd/{1,2}` so `docker logs` shows every run. `infra/backup-cron/entrypoint.sh` runs
      `npm ci` into the bind-mounted deploy clone on first start only (if `node_modules` is
      missing), then `exec cron -f`.
- [x] 4.2 (Superseded task text: "install it idempotently...") Instead: a new `backup-cron`
      service in `docker-compose.yml`, bind-mounting the real deploy clone (read-write), the
      deploy key, and the event store (read-only) at the exact absolute paths their respective
      configs already expect — no host crontab touched at all, so there's nothing to
      idempotently filter; `docker compose up -d backup-cron` is inherently idempotent (re-running
      it doesn't create a second container). Confirmed via a real image build + throwaway
      container run before this landed in compose: `node_modules` installed correctly into the
      real host deploy clone via the bind mount; the baked crontab and `known_hosts` both present
      and correct via `docker exec`.
- [x] 4.3 Verify a real run: trigger the job manually (not by waiting for the schedule), confirm a
      commit lands and pushes to the real remote, then confirm a second immediate run produces
      the "ran, nothing new" evidence rather than either an error or total silence.
      **Found and fixed live, during the very first triggered run:** the container had no git
      identity configured; the first commit attempt failed with "Author identity unknown."
      Fixed by setting `user.name`/`user.email` in the deploy clone's own local git config (same
      treatment `core.sshCommand` already got — persists via the bind-mounted `.git`, no
      container-side config needed). After that fix, verified for real against the actual
      production repository: a manual trigger with real (empty, since no learner data exists
      yet) content produced commit `bd204f1` ("data: sync event log"), pushed to `origin/main`
      via the deploy key; an immediate second trigger produced commit `b4cedcf` ("chore: backup
      ran, no new events"), also pushed; `backup-log.txt` correctly shows both timestamps.
      The dirty-clone refusal was also verified live (an unrelated stray file blocked the run,
      cleanly, with nothing committed) and the `/proc/1/fd` redirect confirmed to actually
      surface a triggered run's output in `docker logs`.
      **Also confirmed against the final, permanently-running production container** (not just the throwaway test image used above): `docker compose up -d backup-cron` from the deploy clone brought up the real `shizi-backup-cron`; a manual trigger against it produced a real commit (`eeb1f91`) and push, visible via `docker logs shizi-backup-cron`.

## 5. Documentation

- [x] 5.1 Document the new `~/.local/share/shizi/` location and its relationship to
      `~/.config/shizi/` in `infra/README.md`, replacing the now-inaccurate `docker volume
      inspect` backup instructions with the fixed path. New "Where production's data lives"
      section added.
- [x] 5.2 Document the completed volume-to-bind-mount migration (counts before/after, rollback
      note that the original volume still exists). Folded into the same new section.
- [x] 5.3 Document the cron job, its credential, and how to check backup health
      (`git log -1 --format=%cr -- data/events/`) as a single copy-pasteable command. Rewrote
      "Backing up the event store" in full for the container-based mechanism: what runs, why a
      container rather than the host's crontab, the deploy-key/git-identity setup, and the
      three-command health-check block. Also updated `data/README.md`, which had gone stale
      ("Not yet populated") the moment the first real backup commit landed.
- [x] 5.4 Note in `infra/README.md` that `automate-event-log-backup` is superseded by this change
      (for anyone who finds a stale reference to it in history).

## 6. Verification

Each item maps to a scenario in `specs/deployment/spec.md`.

- [x] 6.1 `npm run lint && npm run typecheck && npm run test && npm run build` across the
      workspace. All pass: lint clean, typecheck clean across all 8 packages, 384/384 tests
      across 60 files, full build succeeds (17 precache entries, `check-precache` passes).
- [x] 6.2 **Fixed path, no runtime query needed:** confirm the live event store is readable at
      `~/.local/share/shizi/sync-data/events.sqlite` directly, with no `docker volume inspect`
      call anywhere in the process. Confirmed via task 1.6 and again via `pull-events.ts`'s new
      default (task 2.1) — a bare `ls` and a bare script invocation both work with zero
      container-runtime queries.
- [x] 6.3 **Store survives exactly as before:** stop, recreate, and rebuild the `sync` container;
      confirm the event count is unchanged at each step. Confirmed against the real live
      deployment through all three: stop+start, `docker compose up -d sync` (recreate), and a
      full image rebuild + recreate — event/rating counts read 0/0 identically at every step.
- [x] 6.4 **Backup runs without a person:** trigger the cron entry directly (not by waiting a
      full day) and confirm a real commit + push happens end to end. Done repeatedly against the
      real production `shizi-backup-cron` container and the real `origin/main` — see section 4's
      completion notes for the specific commits.
- [x] 6.5 **Coexistence:** (revised for the container-based mechanism — see design.md) confirm
      the host's own crontab is completely untouched (no `shizi`-related entry at all, since
      nothing in this design writes to it); confirm `docker compose up -d backup-cron` run twice
      results in exactly one `shizi-backup-cron` container, not two. Confirmed both: `crontab -l
      | grep -i shizi` finds nothing; running `docker compose up -d backup-cron` twice in a row
      leaves exactly one `shizi-backup-cron` container.
- [x] 6.6 **Commits only the canonical export:** introduce an unrelated uncommitted change in the
      deploy clone, run the backup wrapper, confirm it refuses and reports the conflict rather
      than committing it; clean up afterward. Confirmed against the real `shizi-backup-cron`
      container and the real deploy clone: a stray untracked file blocked the run with a clear
      "Refusing to run" message; nothing committed; file removed afterward.
- [x] 6.7 **Health is self-observable:** confirm `git log -1 --format=%cr -- data/events/` alone
      answers "is this working," and confirm a no-new-data run is distinguishable from silence
      (per 2.2's evidence mechanism). Confirmed: the real commit history on `main` now has both
      a `data: sync event log` commit and multiple `chore: backup ran, no new events` commits,
      each with its own timestamped `backup-log.txt` line — a stalled job (no new commits at
      all) is unambiguously different from either.
- [x] 6.8 **Credential independence:** confirmed by construction (3.1's deploy key is never tied
      to the `gh` login used elsewhere on this machine) — record that this is verified by design,
      not by a destructive logout test on a shared machine. Also confirmed directly: `git fetch`/
      `git push` from the deploy clone succeed via the deploy key with no interactive prompt, and
      every real commit in this section was pushed the same way.
- [x] 6.9 **Event/rating/assignment counts unchanged throughout sections 1-6** — re-check against
      the baseline recorded in task 1.2 at the end of implementation. Final check: 0/0/0,
      unchanged from the task 1.2 baseline through every migration, rebuild, restart, and real
      backup run performed while implementing this change. Production fully healthy: all four
      containers (`shizi-gateway`, `shizi-sync`, `shizi-backup-cron`, `shizi-spikes`) running,
      `/assessment/` and `/assessment/sync/health` both confirmed live.
