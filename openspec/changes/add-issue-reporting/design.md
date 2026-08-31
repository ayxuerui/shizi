## Context

See `proposal.md` for motivation. What already exists, and the constraints it imposes — all enforced
today, not just conventions:

- **A complete device → repo pipeline for small, append-only records.** `apps/assessment/src/offline/db.ts`
  (IndexedDB `shizi-assessment`, version 3, stores `events`/`assignments`/`ratings`, each row
  `{ …, synced }`) → `offline/event-queue.ts` (enqueue validates on write; list re-validates on read)
  → `offline/sync.ts`'s `flushQueue()` (NDJSON POST per route with a Bearer token; never throws; any
  failure leaves the outbox untouched) → `infra/sync-service` (`handle-sync.ts` pure handlers with no
  Node `http` types, `db.ts` SQLite with `INSERT OR IGNORE` on a natural key, `server.ts` route table)
  → `scripts/pull-events.ts` (writes `data/events/events.jsonl` + `ratings.jsonl`; refuses the
  canonical dir when `SHIZI_ENV=dev` without `--out-dir`) → `scripts/backup-and-push.ts` (stages
  exactly the export files + `backup-log.txt`, commits, pushes; run nightly by `backup-cron`).
- **One validator per record type, shared by client and server.** `validateEvent` (`@shizi/learner-state`)
  and `validateSessionRating` (`@shizi/adaptivity`) are each imported by the client's enqueue/read and
  by the server's handler, so allowed values can't drift.
- **Adult-facing surfaces are structurally separated from the child's.** `App.tsx` renders EITHER
  `DiagnosticsScreen` OR the `AudioUnlockGate` → `PracticeRouter` tree, never both.
  `BoutScreen.test.tsx`'s `assertNoScoreLikeText()` asserts `document.body.textContent` contains no
  digit and no `%` across a full bout. `DiagnosticsScreen` is English/ASCII-only in a module-local
  monospace font (`diagnostics/theme.ts`), and `EnvBadge` renders only from the unlock and
  diagnostics screens.
- **Two diagnostics entry points.** `diagnostics/entry.ts` ("the app's only URL read") recognizes
  `#diagnostics`; `DiagnosticsCornerTrigger` is a text-free 56px corner long-press on the unlock
  screen, which is the only mechanism that works in standalone mode. `App.test.tsx` asserts the
  `device diagnostics` affordance is present on the unlock screen and that `DiagnosticsScreen` is
  not mounted without a hash or long-press.
- **Font subset.** `copy.ts` is scanned by `scripts/build-font-subset.ts`; any CJK character rendered
  in the subset font (`--font-hanzi`, which `global.css` sets on `body`) but absent from the subset
  shows as tofu. `DiagnosticsScreen` avoids the issue by being ASCII-only in its own font.
- **Docker build context excludes `.git/`** (`.dockerignore`), so nothing inside an image build can
  run `git rev-parse`. `gateway.Dockerfile` already takes `VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN` as
  build args from `docker-compose.yml`, and Vite inlines any `VITE_*` value present at build time.
- **nginx proxies by prefix.** `location /assessment/sync/` forwards every sub-path to the sync
  service, so a new route needs no change to `nginx-assessment.conf.template` and the deployment
  spec's routing-parity requirement is untouched by construction.
- **`PracticeRouter` is a live projection.** It recomputes the next activity from local event
  history on every mount and keeps only `lastMemoryBoutDate` in `localStorage`, so unmounting the
  practice tree loses nothing durable — relevant to the closing-beat non-goal below.

## Goals / Non-Goals

**Goals:**
- Zero new infrastructure: no container, port, hostname, volume, credential, or external API.
- A report written offline on the iPad lands in `data/events/issue-reports.jsonl` in git with no
  human step beyond the nightly backup that already runs.
- Every report carries the context a developer actually needs (build, environment, session) without
  the parent typing it.
- The child-facing tree is byte-for-byte unaffected; every existing `assertNoScoreLikeText` and
  EnvBadge-containment assertion keeps passing unmodified.
- One schema/validator shared by client and server, following the existing pattern exactly.

**Non-Goals:**
- **An entry point on the closing beat or anywhere inside an activity.** Any App-level adult screen
  unmounts the practice tree, and while `PracticeRouter`'s remount is lossless, a report control
  rendered in the child's tree — even a text-free long-press like `DiagnosticsCornerTrigger`, which
  was written to be safe there — is a change to the child-facing surface that should be made on
  evidence that the relaunch friction (kill → relaunch → long-press → tap) is real, not assumed.
  Deferred; see Risks.
- Screenshots or any attachment. Text only.
- A GitHub Issues bridge. The committed JSONL is the record; a script that opens issues from
  unfiled lines is a possible follow-up over the same file, not part of this change.
- Any "resolved"/"triaged" state on a report. Reports are append-only like every other record here;
  resolution lives in commits and PRs.
- Rate limiting or a request body size cap on the sync service. No route has one today; adding one
  is a service-wide decision, not this change's.

## Decisions

**Reports ride the existing sync pipeline, not a new channel.** Alternatives considered: (a) the
GitHub Issues API called from the client — needs a GitHub token in a public bundle (the shared sync
token is already public by design, but a GitHub token grants far more than "append one row") or a
server-side proxy holding a new secret, and requires connectivity at submit time; (b) a `mailto:`
link — no structure, no offline path, no automatic context, and depends on a mail client being set
up on the child's iPad; (c) a separate service — nothing to gain over the one that exists. The
existing pipeline already gives offline-first queuing, idempotent delivery, shared-token auth, a
durable git-side export, and nightly automation for free.

**A new shared package, `@shizi/issue-reports`, holds the type and the validator.** Alternatives:
putting it in `@shizi/adaptivity` next to `SessionRating` (wrong home — a bug report is not
adaptivity instrumentation) or in `@shizi/learner-state` (a report is not learner state); or two
hand-rolled structural guards, one per side (exactly the drift `validateSessionRating`'s "one
validator, three call sites" comment exists to prevent). Package boilerplate mirrors
`packages/adaptivity` (`main`/`types` pointing at `src/index.ts`, `composite` tsconfig, a root
`tsconfig.json` reference, a `vitest.config.ts` picked up by the root `projects` glob). No
dependencies beyond `@shizi/learner-state` for the shared `ValidationResult` shape — or, simpler,
its own identical `ValidationResult` interface as `adaptivity` already does.

**Schema.**
```
IssueReport {
  id: string            // crypto.randomUUID() on the device; the idempotency key
  kind: "bug" | "feature"
  message: string       // trimmed, 1..MAX_MESSAGE_LENGTH (2000)
  createdAt: string     // ISO 8601 UTC
  context: {
    appEnv: string          // VITE_APP_ENV ?? "prod"
    buildId: string         // VITE_BUILD_ID ?? "unknown"
    userAgent: string
    standalone: boolean     // display-mode: standalone, or legacy navigator.standalone
    online: boolean         // navigator.onLine at write time
    lastSessionId: string | null
    lastActivity: string | null   // "<module>/<activity>" of the most recent local event
  }
}
```
`ISSUE_KINDS`, `MAX_MESSAGE_LENGTH`, and a `MAX_CONTEXT_FIELD_LENGTH` (256, applied to each string
context field) are exported constants so the bounds have one home. `validateIssueReport(value)`
follows `validateSessionRating`'s discipline: presence-not-truthiness checks first, then per-field
type/bound checks, returning `{ valid, errors }`. `lastSessionId`/`lastActivity` must be present
(null allowed) rather than optional — "explicitly empty, not absent" per the spec, and it keeps the
JSONL self-describing. Rejected alternative: a free-form `context: Record<string, unknown>` —
cheaper now, but it would make the server's "defense in depth" validation meaningless for the one
part of the record the server can't otherwise trust.

**Context is stored as one JSON text column server-side, not per-field columns.** Reading reports
happens on the exported JSONL (`jq`), never via SQL against the live store; per-field columns would
be schema churn for every context addition with no reader to benefit. `id`, `kind`, `message`,
`created_at`, and `received_at` stay as real columns because they're what ordering and idempotency
use. Table added via the existing `CREATE TABLE IF NOT EXISTS` block; `SCHEMA_VERSION` is untouched
because no migration of existing rows is involved.

**A separate adult-facing screen, routed either/or at the App level — not a section of
`DiagnosticsScreen`, not a modal over the child tree.** A section inside diagnostics would fold a
free-text form into a screen whose whole identity is a pre-flight checklist ending in a JSON dump;
a modal over the practice tree would break the "never mounted alongside" containment that makes the
no-score guarantee structural rather than conventional. `App.tsx`'s `diagnosticsOpen: boolean`
becomes `parentScreen: "diagnostics" | "report" | null`, with the same either/or shape.
`DiagnosticsScreen` gains an optional `onOpenReport` prop and renders a "Report a problem or idea"
button at the top only when it's provided — the same opt-in-by-prop pattern as `AudioUnlockGate`'s
`onDiagnosticsRequest`. `diagnostics/entry.ts` grows a second recognized fragment (`#report`) via
`requestedParentScreen(loc)` and `clearParentScreenHash(win)`; the existing `isDiagnosticsRequested`/
`clearDiagnosticsHash` exports remain as thin wrappers so `entry.test.ts` and the "only URL read"
claim both stay true at the module level.

**Context collection is a pure function with injected dependencies.**
`issues/issue-context.ts`'s `collectIssueContext(deps)` takes `{ appEnv, buildId, userAgent,
matchMedia?, navigatorStandalone?, isOnline, loadPriorEvents }` and returns an `IssueReportContext`,
reusing `describeEnvironment` from `diagnostics/capabilities/service-worker.ts` for the
standalone/online pair rather than re-deriving it. `lastSessionId`/`lastActivity` come from the
event with the greatest `timestamp` in `loadPriorEvents()` — a derived read over the same local
history `PracticeRouter` already uses, not a new "current session" state threaded through the
session layer. Rejected: writing the current session id into `sessionStorage` from
`useAssessmentSession` — new cross-cutting state for a field that's derivable.

**Build id: `VITE_BUILD_ID`, resolved in `vite.config.ts` with a three-step fallback and injected via
`define`.** Priority: an explicit `VITE_BUILD_ID` in the build environment (the Docker build arg, or
anything CI sets) → `git rev-parse --short HEAD` in a `try/catch` (host builds, where `.git` exists) →
the literal `"unknown"`. This keeps the documented dev build command (`npx vite build --mode dev`)
unchanged, and makes production builds correct once `docker-compose.yml` passes
`VITE_BUILD_ID: ${VITE_BUILD_ID:-unknown}` as a `gateway` build arg and the release procedure
exports it. `define` (`"import.meta.env.VITE_BUILD_ID"`) rather than mutating `process.env` inside
the config function, so the value is set in exactly one place regardless of how Vite's env loading
orders things. `DiagnosticsScreen`'s existing context line also prints `build=<id>` — one line, and
it's the natural place for a parent to read back which build they're on when filing a report.

**The screen uses a module-local system font stack and never touches `copy.ts`.** Labels are
English/ASCII (same reasoning as `DiagnosticsScreen.tsx`'s header comment), and both the screen root
and the `<textarea>` set `fontFamily` to a system stack (`system-ui, -apple-system, "PingFang SC",
"Hiragino Sans GB", "Segoe UI", sans-serif`) so typed Chinese renders via the platform font, not the
LXGW WenKai subset. The textarea also sets `userSelect: "text"`/`WebkitUserSelect: "text"` and
`touchAction: "auto"` because `global.css` disables selection and callouts on `body` for stylus
reasons; an editable control needs them back. This is the one spot in the app where free text is
typed, so it's a local override, not a global change.

**Outbox and flush follow the `ratings` (natural-key) pattern exactly.** IndexedDB version 3 → 4
adds an `issueReports` store with `keyPath: "report.id"`; the existing `contains` guards create it
on both fresh and upgraded databases, and the v3 cursor walks re-run harmlessly (they're no-ops on
already-translated rows). `event-queue.ts` gains `enqueueIssueReport` (validate-then-put),
`listPendingIssueReports` (re-validate on read), `markIssueReportsSynced`. `sync.ts` adds a fourth
leg after ratings, posting `toJsonl(reports)` to `${endpoint}/issue-reports`, and
`FlushResult.flushed` gains `issueReportsCount` — additive; existing callers and tests keep working.
The existing short-circuit (an earlier leg's failure aborts the flush) is kept: a report waiting
behind failing events is the lesser problem, and the same choice was made for ratings.

**Export and backup treat `issue-reports.jsonl` as a third canonical file, symmetric with
`ratings.jsonl`.** `pullEvents()` writes it and returns `issueReportsCount`;
`assertCleanOutsideExport` adds it to the pathspec exclusions; the `git add` list and the
`git diff --cached` new-data check both include it, so a run where only reports changed commits as
`data: sync event log`, not `chore: backup ran, no new events`; the `backup-log.txt` line becomes
`ran: N events, M ratings, K reports`. The dev-store guard needs no change — it fires before any
file is written.

**Route name `/issue-reports`.** Sibling of `/events`, `/assignments`, `/ratings`; the handler is
`handleIssueReportsSync`, structurally identical to `handleRatingsSync` (auth → parse NDJSON →
validate each → `INSERT OR IGNORE` → `{ inserted, duplicates, rejected, errors? }`).

## Risks / Trade-offs

- **[Risk] Relaunch friction blunts in-the-moment capture.** Reaching the form from a running
  session means killing the app, relaunching, long-pressing the corner, and tapping through
  diagnostics. → Mitigation: none in this change beyond documenting the path in `infra/README.md`;
  the closing-beat entry is a deliberate non-goal (above) to be revisited on evidence. If added
  later, `DiagnosticsCornerTrigger`'s text-free design already fits, and `PracticeRouter`'s
  lossless remount means the plumbing cost is small.
- **[Risk] iOS text entry inside a page that disables selection, callouts, and non-manipulation
  touch actions.** → Mitigation: the textarea overrides those three properties locally; task 8's
  on-device check on the dev stack verifies the keyboard appears, text can be edited, and the
  page doesn't scroll-jump. A failure here is a styling fix, not a design change.
- **[Risk] Anyone holding the (publicly bundled) shared token can post reports.** → Accepted under
  the same "Auth: shared token, not accounts" decision that already covers events and ratings; the
  worst case is noise lines in a git-tracked text file, the message bound keeps each one small, and
  token rotation is the existing remedy. Not introducing a body-size cap here (Non-Goals).
- **[Risk] The IndexedDB version bump is not downgradable.** A device that has opened version 4
  cannot run a build that asks for version 3 (`VersionError`) without clearing site data. → Same
  exposure the v2→v3 bump accepted; state it in the migration plan and roll the gateway forward,
  not back, once any device has opened the new build. The sync service and export changes are
  independently reversible.
- **[Trade-off] A second URL fragment in "the app's only URL read."** The claim stays true at
  module granularity (`entry.ts` is still the only place `location.hash` is read), which is what
  the header comment actually argues for.
- **[Trade-off] Context as a JSON column.** Not queryable in SQL — deliberate, see Decisions.
- **[Trade-off] Flush short-circuit ordering.** A report can be stuck behind a failing events leg;
  accepted for parity with ratings, and because that failure would already be the more important
  signal.

## Migration Plan

1. **Ship the sync service and gateway together** with the existing release procedure
   (`docker compose build gateway sync backup-cron` → `up -d`). Order doesn't matter in practice
   because both recreate in one step; if they were split, a new client against an old service gets
   `404` on `/issue-reports`, `flushQueue` returns `failed`, and the report stays queued — no loss.
2. **Release procedure gains one line**, before the build:
   `export VITE_BUILD_ID=$(git rev-parse --short HEAD)`. Without it the build is still valid and
   reports say `"unknown"`, per spec.
3. **No data migration.** The SQLite table is created on next boot; existing rows are untouched.
   The IndexedDB upgrade runs on next launch of the new build and is additive.
4. **Rollback:** gateway via the existing image-tag procedure, with the version-4 caveat above;
   sync service to the prior image (the extra table is inert). `data/events/issue-reports.jsonl`,
   once committed, is just a file — leave it.
5. **Dev verification** (the only way to test the real device path, per `AGENTS.md`): build with
   `--mode dev`, restart `shizi-gateway-dev`, open
   `https://shizi-dev.realxco.com/assessment/#report`, file one bug and one feature report, then
   confirm they reached dev's store via `pull-events.ts --out-dir /tmp/dev-export` and that
   `data/events/` in the checkout is unchanged.
