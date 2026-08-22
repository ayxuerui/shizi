# data

Candidate character pool, curriculum weights, and exported learner event
logs (durable canonical record — see `learner-state` spec's "durable
repo-side export" requirement).

- `events/events.jsonl`, `events/ratings.jsonl` — the durable export
  (`infra/sync-service/scripts/pull-events.ts`), regenerated and
  committed automatically once a day by the `backup-cron` container —
  see `infra/README.md`'s "Backing up the event store". No real
  learner data existed as of `harden-event-store` (2026-08-22); every
  commit to this directory so far is a real backup run against an
  empty store, not synthetic test data.
- `events/backup-log.txt` — one line per backup run, including runs
  that found nothing new, so a quiet week and a stalled job are never
  confused with each other. `git log -1 --format=%cr -- data/events/`
  is the actual backup-health check; see `infra/README.md`.

Everything else (the character pool, curriculum weights) — see
`openspec/changes/bootstrap-shizi-assessment/tasks.md` Section 3
("Character data core") — is not yet populated.
