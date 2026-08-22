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

- [ ] 3.1 Create a fine-grained GitHub PAT (or deploy key) scoped to `contents:write` on this
      repository only — not the interactive `gh auth` login already used elsewhere on this
      machine.
- [ ] 3.2 Store it in `~/.config/shizi/` alongside the existing durable secrets — one place
      operators already know to check. Record a copy in a password manager.
- [ ] 3.3 Configure the deploy clone's git remote (or the wrapper script directly) to push using
      this credential, independent of any `gh`-managed helper.

## 4. Cron installation

- [ ] 4.1 Write the crontab entry following this host's existing `pkm-maintenance` idiom exactly:
      `flock -n /tmp/shizi-backup.lock -c '...'`, tagged with a trailing `# shizi-backup` comment,
      daily cadence, sourcing a `.env` for the credential from 3.2/3.3 and an explicit `PATH`
      (cron's own environment is otherwise near-empty).
- [ ] 4.2 Install it idempotently: read the current crontab, filter out only lines already tagged
      `# shizi-backup` (so a re-install replaces rather than duplicates), append the new entry,
      write back. Verify every pre-existing `pkm-maintenance` line is still present afterward,
      byte for byte.
- [ ] 4.3 Verify a real run: trigger the job manually (not by waiting for the schedule), confirm a
      commit lands and pushes to the real remote, then confirm a second immediate run produces
      the "ran, nothing new" evidence rather than either an error or total silence.

## 5. Documentation

- [ ] 5.1 Document the new `~/.local/share/shizi/` location and its relationship to
      `~/.config/shizi/` in `infra/README.md`, replacing the now-inaccurate `docker volume
      inspect` backup instructions with the fixed path.
- [ ] 5.2 Document the completed volume-to-bind-mount migration (counts before/after, rollback
      note that the original volume still exists).
- [ ] 5.3 Document the cron job, its credential, and how to check backup health
      (`git log -1 --format=%cr -- data/events/`) as a single copy-pasteable command.
- [ ] 5.4 Note in `infra/README.md` that `automate-event-log-backup` is superseded by this change
      (for anyone who finds a stale reference to it in history).

## 6. Verification

Each item maps to a scenario in `specs/deployment/spec.md`.

- [ ] 6.1 `npm run lint && npm run typecheck && npm run test && npm run build` across the
      workspace.
- [ ] 6.2 **Fixed path, no runtime query needed:** confirm the live event store is readable at
      `~/.local/share/shizi/sync-data/events.sqlite` directly, with no `docker volume inspect`
      call anywhere in the process.
- [ ] 6.3 **Store survives exactly as before:** stop, recreate, and rebuild the `sync` container;
      confirm the event count is unchanged at each step.
- [ ] 6.4 **Backup runs without a person:** trigger the cron entry directly (not by waiting a
      full day) and confirm a real commit + push happens end to end.
- [ ] 6.5 **Coexistence:** diff the crontab before and after installation; confirm every
      `pkm-maintenance` line is untouched and exactly one `# shizi-backup` line exists. Re-run the
      installer and confirm still exactly one such line, not two.
- [ ] 6.6 **Commits only the canonical export:** introduce an unrelated uncommitted change in the
      deploy clone, run the backup wrapper, confirm it refuses and reports the conflict rather
      than committing it; clean up afterward.
- [ ] 6.7 **Health is self-observable:** confirm `git log -1 --format=%cr -- data/events/` alone
      answers "is this working," and confirm a no-new-data run is distinguishable from silence
      (per 2.2's evidence mechanism).
- [ ] 6.8 **Credential independence:** confirmed by construction (3.1's PAT is never tied to a
      `gh` login) — record that this is verified by design, not by a destructive logout test on
      a shared machine.
- [ ] 6.9 **Event/rating/assignment counts unchanged throughout sections 1-6** — re-check against
      the baseline recorded in task 1.2 at the end of implementation.
