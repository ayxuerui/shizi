## 1. Backup script

- [ ] 1.1 Add `infra/sync-service/scripts/backup-and-push.sh` (or a small TS wrapper, matching
      the repo's existing script style): resolves the event volume's real host mountpoint via
      `docker volume inspect`, runs `pull-events.ts` with `EVENTS_DB_PATH` pointed at it (never
      `docker exec` — see design.md's confirmed-broken-vs-confirmed-working finding), then handles
      the git steps.
- [ ] 1.2 Before touching git, check the working copy for uncommitted changes outside
      `data/events/`; abort with a clear message if any exist, per the spec's "commits only the
      canonical export" requirement. Do not `git add -A`.
- [ ] 1.3 `git add data/events/*.jsonl`; if the diff is empty, still record evidence the run
      happened (e.g. an empty commit or append to a run-log file) rather than exiting silently —
      satisfies the spec's "distinguishable from silence" scenario.
- [ ] 1.4 `git commit` (only when there's a real diff) and `git push`; on push failure, exit
      non-zero with the actual git error rather than swallowing it, so the timer's own failure log
      is the alerting mechanism.
- [ ] 1.5 Unit test the "refuses when the clone is dirty outside data/events/" branch and the
      "commits only the export files when that's the only diff" branch, using a scratch git repo
      — same pattern as `pull-events.test.ts`'s scratch-directory approach.

## 2. Durable push credential

- [ ] 2.1 Create a fine-grained GitHub PAT scoped to `contents:write` on this repository only (or
      a deploy key, if preferred) — not the interactive `gh auth` login already used elsewhere on
      this machine.
- [ ] 2.2 Store it outside every git working tree, alongside the sync token's durable location
      (`harden-prod-deployment` task 4.1's `~/.config/shizi/`) — one place operators already know
      to check, not a second convention. Record a copy in a password manager.
- [ ] 2.3 Configure the deploy clone's git remote (or the script directly) to use this credential
      for pushes, independent of any `gh`-managed helper.

## 3. Scheduling

- [ ] 3.1 Run `loginctl enable-linger ubuntu` (or the appropriate user) and verify it actually
      took effect — this is the step that's easy to skip and fails with no error if missed.
- [ ] 3.2 Add a `systemd --user` service unit invoking the script from task 1, with its working
      directory set to the deploy clone (or, if this lands before `harden-prod-deployment`,
      whichever checkout currently operates production — flagged as a one-line follow-up in that
      case).
- [ ] 3.3 Add the corresponding `systemd --user` timer, daily cadence, with `Persistent=true` so a
      missed run (host asleep, etc.) still fires on next boot rather than waiting a full interval.
- [ ] 3.4 Verify end to end: enable the timer, trigger a manual run
      (`systemctl --user start <unit>`), confirm a commit lands and pushes, confirm a second
      immediate run produces the "ran, nothing new" evidence rather than either an error or
      total silence.

## 4. Documentation

- [ ] 4.1 Document the full setup in `infra/README.md`: the timer, `enable-linger`, the PAT and
      where it lives, and — most importantly — how to check backup health
      (`git log -1 --format=%cr -- data/events/`) as a single copy-pasteable command.
- [ ] 4.2 Cross-reference task 2.6 (`bootstrap-shizi-assessment`) explicitly: state that
      client-side retention is currently relied upon as a backstop, and that its real-world limits
      remain unconfirmed — per this change's own spec requirement, not left implicit.

## 5. Verification

- [ ] 5.1 With real or realistic test data in the live store, run the full loop once manually and
      confirm `data/events/events.jsonl`/`ratings.jsonl` land in git and push to the actual
      remote — the first time this has ever actually happened end to end.
- [ ] 5.2 Confirm the "operator absent" scenario functionally: log out entirely, and confirm
      (e.g. via the timer's own logs, or a scheduled trigger while logged out if feasible to
      simulate) that the unit still fires without an active interactive session.
- [ ] 5.3 Confirm the dirty-clone refusal against the real deploy clone: introduce an unrelated
      uncommitted change, run the script, confirm it refuses and reports clearly, then clean up.
- [ ] 5.4 Confirm the credential independence: this is best verified by construction (task 2's PAT
      is never tied to a `gh` login) rather than by actually logging out of `gh` on a shared
      machine — record that the verification is by design, not by destructive test.
