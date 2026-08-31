## 1. Shared schema package (`@shizi/issue-reports`) — do first, everything else imports it

- [x] 1.1 Create `packages/issue-reports/` mirroring `packages/adaptivity`'s boilerplate exactly:
      `package.json` (`"name": "@shizi/issue-reports"`, `main`/`types` → `./src/index.ts`, `build`/`typecheck`
      scripts, `typescript` + `vitest` devDependencies, no runtime dependencies), `tsconfig.json`
      (extends `../../tsconfig.base.json`, `composite`, `outDir ./dist`, `rootDir ./src`, `include src/**/*`),
      and a `vitest.config.ts` (the root config's `projects: ["packages/*"]` glob picks it up). Add
      `{ "path": "./packages/issue-reports" }` to the root `tsconfig.json` references. Wire it into
      `apps/assessment` and `infra/sync-service` the same way `@shizi/adaptivity` is wired into each
      (`"@shizi/issue-reports": "*"` in `dependencies`, plus a tsconfig `references` entry where that
      workspace lists them). Run `npm install` so the workspace symlink exists.
- [x] 1.2 `src/types.ts`: `ISSUE_KINDS = ["bug", "feature"] as const`, `IssueKind`, `IssueReportContext`
      (`appEnv`, `buildId`, `userAgent`: string; `standalone`, `online`: boolean; `lastSessionId`,
      `lastActivity`: `string | null` — present-but-nullable, never optional), `IssueReport` (`id`, `kind`,
      `message`, `createdAt`, `context`), `MAX_MESSAGE_LENGTH = 2000`, `MAX_CONTEXT_FIELD_LENGTH = 256`, and
      `REQUIRED_REPORT_FIELDS` / `REQUIRED_CONTEXT_FIELDS` arrays kept next to the types so the validator's
      required-field list can't drift from them (same single-source-of-truth pattern as
      `learner-state`'s `REQUIRED_EVENT_FIELDS`).
- [x] 1.3 `src/validation.ts`: `validateIssueReport(value: unknown): ValidationResult` following
      `validateSessionRating`'s discipline — non-null object check; presence (not truthiness) of every
      required top-level and context field; then `id` non-empty string, `kind` ∈ `ISSUE_KINDS`, `message`
      a string that is non-empty after `trim()` and ≤ `MAX_MESSAGE_LENGTH`, `createdAt` parses as ISO 8601,
      `standalone`/`online` booleans, each string context field ≤ `MAX_CONTEXT_FIELD_LENGTH`,
      `lastSessionId`/`lastActivity` either `null` or a bounded string. `src/index.ts` exports all of the
      above plus `ValidationResult`.
- [x] 1.4 `src/validation.test.ts`: a valid bug report and a valid feature report pass; each missing
      required field (top-level and context) is reported by name; `kind: "question"` rejected; empty and
      whitespace-only `message` rejected; a message of exactly 2000 characters passes and 2001 fails; a
      257-character `userAgent` fails; `lastSessionId: null` passes while an absent `lastSessionId` fails;
      a non-ISO `createdAt` fails; a non-object input returns a single error without throwing.

## 2. Sync service: store, route, export, backup

- [x] 2.1 `infra/sync-service/src/db.ts`: add `issue_reports` (`id TEXT PRIMARY KEY, kind TEXT NOT NULL,
      message TEXT NOT NULL, created_at TEXT NOT NULL, context_json TEXT NOT NULL, received_at ... DEFAULT
      (strftime(...))`) to the `CREATE TABLE IF NOT EXISTS` block — `SCHEMA_VERSION` unchanged, no
      migration. Add `insertIssueReport(report): { inserted }` (`INSERT OR IGNORE`, context serialized with
      `JSON.stringify`) and `getAllIssueReports(): IssueReport[]` (ordered `created_at ASC, id ASC`,
      `context_json` parsed back) to the `EventStore` interface and implementation, with a doc comment
      pointing at design.md's "context as one JSON column" decision.
- [x] 2.2 `db.test.ts`: insert then read back round-trips a report byte-for-byte including `null` context
      fields; a second insert with the same `id` reports `inserted: false` and leaves one row; ordering by
      `created_at`; opening a store created before this change (create a DB with the pre-existing schema in
      the test, insert an event, reopen) gains the table while every existing row survives untouched.
- [x] 2.3 `infra/sync-service/src/handle-sync.ts`: `handleIssueReportsSync(input, deps)` — structurally
      identical to `handleRatingsSync`: `checkAuth` → `parseNdjson` (400 on malformed) → per candidate
      `validateIssueReport` from `@shizi/issue-reports` (rejected + errors on failure) →
      `store.insertIssueReport` → `{ inserted, duplicates, rejected, errors? }`. Register
      `"/issue-reports": handleIssueReportsSync` in `server.ts`'s `ROUTES`. Extend `endpoint.ts`'s doc
      comment in the app (task 3.4) and the `sync-service/` bullet in `infra/README.md` (task 6.1) to list
      the fourth route.
- [x] 2.4 `handle-sync.test.ts`: 401 with no header and with the wrong token (nothing stored); 400 on
      malformed NDJSON; a valid two-report batch → `inserted: 2`; re-sending the same batch → `duplicates: 2`;
      a batch with one unknown-`kind` report and one 2001-character message alongside a valid one →
      `inserted: 1, rejected: 2`, `errors` names both problems, and the valid report is in the store.
- [x] 2.5 `infra/sync-service/scripts/pull-events.ts`: `pullEvents()` also writes
      `issue-reports.jsonl` (via `toJsonl(store.getAllIssueReports())`) into the resolved `outDir` and
      returns `issueReportsCount`; the CLI prints a third `Wrote N issue reports to …` line. Update the
      header comment's file list. `pull-events.test.ts`: the file is written with one line per report;
      when the dev-store guard fires, `issue-reports.jsonl` is absent from the canonical dir exactly as
      `events.jsonl` is; an empty store still writes an empty file (so the backup's `git add` never fails on
      a missing path).
- [x] 2.6 `infra/sync-service/scripts/backup-and-push.ts`: add `data/events/issue-reports.jsonl` to
      `assertCleanOutsideExport`'s `:!` pathspec exclusions, to the `git add` list, and to the
      `git diff --cached --quiet` new-data check; change the `backup-log.txt` line to
      `ran: N events, M ratings, K issue reports` and the CLI summary to match. `backup-and-push.test.ts`: a
      run where ONLY `issue-reports.jsonl` changed commits with the `data: sync event log` message (not
      `chore: backup ran, no new events`); the log line includes the report count; a modified
      `issue-reports.jsonl` alone does not trip `DirtyCloneError`, while an unrelated dirty file still does.

## 3. Client outbox and flush (`apps/assessment/src/offline/`)

- [x] 3.1 `db.ts`: `DB_VERSION` 3 → 4; `StoredIssueReport { report: IssueReport; synced: boolean }`; an
      `issueReports` store with `keyPath: "report.id"` added inside the existing `contains`-guarded block
      (fresh and upgraded databases both get it; the v3 cursor walks stay and are no-ops on translated
      rows). Extend the schema doc comment: natural-key pattern like `ratings`, and note the
      version-4-is-not-downgradable caveat from design.md.
- [x] 3.2 `event-queue.ts`: `enqueueIssueReport(report)` (validate-then-`put`, `console.error` and return
      on invalid — same as `enqueueRating`), `listPendingIssueReports()` (unsynced only, re-validated on
      read, invalid rows `console.warn`ed and skipped), `markIssueReportsSynced(ids)`.
- [x] 3.3 `event-queue.test.ts`: an invalid report is refused and the store stays empty; enqueue → list
      returns it; mark synced → list is empty but the row still exists (`db.getAll` length 1 — the
      client-retention backstop); a stored row that fails validation on read is skipped, not thrown.
- [x] 3.4 `sync.ts`: read `listPendingIssueReports()` in the same `Promise.all`; treat "nothing pending"
      as all four lists empty; add a fourth leg after ratings posting `toJsonl(reports)` to
      `${config.endpoint}/issue-reports`, returning `{ status: "failed", reason: "issue-reports HTTP …" }` on
      non-2xx and `markIssueReportsSynced` on success; add `issueReportsCount` to the `flushed` result.
      Update `endpoint.ts`'s doc comment to list four routes. `sync.test.ts`: posts NDJSON with the bearer
      header to `/issue-reports`; marks synced on 2xx; leaves the report pending on a 500 without touching
      already-synced earlier legs; a flush with only a report pending is `flushed` with
      `issueReportsCount: 1`, not `skipped`; every existing `flushed` assertion gains `issueReportsCount: 0`.
- [x] 3.5 `db.test.ts`: create a version-3 database with one event and one rating (open with `openDB(...,
      3)` directly), close it, then `getDB()` → both rows still present and `issueReports` exists.

## 4. Build identifier

- [x] 4.1 `apps/assessment/vite.config.ts`: resolve `buildId` as `process.env.VITE_BUILD_ID` →
      `execFileSync("git", ["rev-parse", "--short", "HEAD"])` in a `try/catch` → `"unknown"`, and inject it
      with `define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId) }`. Header comment: why
      three steps (`.dockerignore` excludes `.git/`, so the image build can only get it as an arg; host
      builds get it for free so the documented dev build command stays unchanged).
- [x] 4.2 `infra/gateway.Dockerfile`: `ARG VITE_BUILD_ID` + `ENV VITE_BUILD_ID=${VITE_BUILD_ID}` in the
      build stage beside the two existing args. `docker-compose.yml` `gateway.build.args`:
      `VITE_BUILD_ID: ${VITE_BUILD_ID:-unknown}` with a comment. `infra/README.md` "Releasing a new
      version": add `export VITE_BUILD_ID=$(git rev-parse --short HEAD)` before `docker compose build`, and
      note that omitting it is harmless (reports say `unknown`).
- [x] 4.3 `DiagnosticsScreen.tsx`: append `build=<VITE_BUILD_ID ?? "unknown">` to the existing
      `standalone=… online=…` context line. `DiagnosticsScreen.test.tsx`: shows `build=unknown` by default
      and the stubbed value under `vi.stubEnv("VITE_BUILD_ID", "abc1234")`.

## 5. Adult-facing report screen (`apps/assessment/src/issues/`)

- [x] 5.1 `issues/issue-context.ts`: `collectIssueContext(deps)` with injected
      `{ appEnv, buildId, userAgent, matchMedia?, navigatorStandalone?, isOnline, loadPriorEvents }` →
      `Promise<IssueReportContext>`; uses `describeEnvironment` from
      `diagnostics/capabilities/service-worker.ts` for `standalone`/`online`; `lastSessionId`/`lastActivity`
      (`"<module>/<activity>"`) from the event with the greatest `timestamp`, `null`/`null` when there are
      none; `appEnv` defaults to `"prod"`, `buildId` to `"unknown"`. `issue-context.test.ts` covers each of
      those branches with scripted deps — no real IndexedDB needed.
- [x] 5.2 `issues/IssueReportScreen.tsx` (`{ onExit, onSubmitted?, deps? }`): renders `<EnvBadge />`; a
      heading; two kind buttons ("Something went wrong" → `bug`, "I have an idea" → `feature`, `aria-pressed`
      reflecting selection, `bug` preselected); a `<textarea>` with `maxLength={MAX_MESSAGE_LENGTH}`,
      `aria-label="Report message"`, and inline `fontFamily` set to the module-local system stack plus
      `userSelect`/`WebkitUserSelect: "text"` and `touchAction: "auto"` (see design.md — `global.css`'s
      body rules must be undone locally on the one editable control in the app); a `n / 2000` counter; a
      "Save report" button disabled while `message.trim()` is empty; a line `N report(s) waiting to be sent`
      when `listPendingIssueReports()` is non-empty; and a "Back" button calling `onExit`. On save: build
      `{ id: crypto.randomUUID(), kind, message: message.trim(), createdAt: new Date().toISOString(),
      context: await collectIssueContext(...) }`, `enqueueIssueReport`, `void flushQueue()`, then swap to a
      confirmation ("Saved on this device. It is sent automatically the next time the app is online.") with
      "Write another" and "Back". Every label English/ASCII; the whole screen in the system font stack;
      nothing added to `copy.ts`. Header comment mirrors `DiagnosticsScreen.tsx`'s on why that's
      load-bearing.
- [x] 5.3 `issues/IssueReportScreen.test.tsx` (fake-indexeddb, `__resetDBForTests` in before/after like
      `DiagnosticsScreen.test.tsx`): Save is disabled with an empty/whitespace message; selecting "I have an
      idea" and saving enqueues a `feature` report whose `message` is trimmed and whose context has every
      required field; the confirmation appears and the textarea is gone; "Write another" returns to an empty
      form; the pending line reads `1 report waiting to be sent` after a save (no endpoint configured, so it
      stays pending); the textarea's `maxLength` is 2000 and its computed `font-family` is not
      `var(--font-hanzi)`; typing `山` into the textarea keeps it in the DOM value; "Back" calls `onExit`;
      a regression sweep that the rendered text contains no CJK character (`/[一-鿿]/`) — labels
      stay ASCII so the font-subset invariant can't be broken here.
- [x] 5.4 `diagnostics/entry.ts`: add `REPORT_HASH = "#report"`, `requestedParentScreen(loc):
      "diagnostics" | "report" | null`, and `clearParentScreenHash(win)` (clears either fragment); keep
      `isDiagnosticsRequested`/`clearDiagnosticsHash` as one-line wrappers so `entry.test.ts` is untouched.
      Extend the header comment ("the app's only URL read" now covers two fragments in one module).
      `entry.test.ts` additions: `#report` → `"report"`, `#diagnostics` → `"diagnostics"`, `""`/`#other` →
      `null`; `clearParentScreenHash` clears `#report` and is a no-op otherwise.
- [x] 5.5 `DiagnosticsScreen.tsx`: optional `onOpenReport?: () => void`; when provided, render a
      "Report a problem or idea" button directly under the `<h1>`, above section (a). Doc comment: opt-in by
      prop, same pattern as `AudioUnlockGate`'s `onDiagnosticsRequest`. `DiagnosticsScreen.test.tsx`: the
      button is absent without the prop, present with it, and clicking it calls the callback.
- [x] 5.6 `App.tsx`: replace `diagnosticsOpen` with `parentScreen: "diagnostics" | "report" | null`
      (initial value from `requestedParentScreen(window.location)`, updated on `hashchange`); render
      `IssueReportScreen` for `"report"` and `DiagnosticsScreen` (with `onOpenReport={() =>
      setParentScreen("report")}`) for `"diagnostics"`, each with an `onExit` that calls
      `clearParentScreenHash(window)` and sets `null`; the child tree renders only when `parentScreen` is
      `null`. `App.test.tsx`: `#report` shows the report heading and not the unlock button; exiting returns
      to the unlock screen with the hash cleared; the unlock screen has no button matching `/report/i`; after
      the unlock tap, `document.body.textContent` contains neither "Report" nor "Save report"; all existing
      cases (including the EnvBadge containment block) pass unmodified.
- [x] 5.7 Confirm `copy.ts`, `styles/tokens.css`, `styles/global.css`, and everything under `src/bout/`,
      `src/exposure/`, `src/memory/`, `src/closing/`, and `src/session/` are untouched (`git diff --stat`).

## 6. Documentation

- [x] 6.1 `infra/README.md`: list `/issue-reports` in the `sync-service/` bullet; add a "Bug reports and
      feature requests" section — how the adult reaches the form (cold start → corner long-press →
      "Report a problem or idea"; `#report` for desk testing), that it works offline, where reports land
      (`data/events/issue-reports.jsonl`, nightly), and two `jq` one-liners (all reports newest-first; bugs
      only with `buildId`/`lastSessionId`). Include the `VITE_BUILD_ID` line from task 4.2 in the release
      procedure.
- [x] 6.2 `data/README.md`: add `events/issue-reports.jsonl` to the durable-export list with one line on
      what each record carries and that reports are append-only (resolution lives in commits/PRs, not in
      the file).
- [x] 6.3 `AGENTS.md`: under "What 'working' looks like on dev", add that `#report` opens the report form
      and that a report filed on dev must appear in dev's store (`pull-events.ts --out-dir`) and never in
      `data/events/`.

## 7. Verification (automated)

- [x] 7.1 `npm run lint && npm run typecheck && npm test && npm run build` from the repo root, and
      `openspec validate add-issue-reporting --strict` — all clean.
- [x] 7.2 Regression signals unmodified and passing: every `assertNoScoreLikeText()` call site in
      `BoutScreen.test.tsx`, the EnvBadge containment block in `App.test.tsx`, and `bout-machine.test.ts`'s
      exhaustive `BoutState` key-set assertion. Confirm `collectCopyCharacters()` returns the same set as
      before (`copy.ts` untouched).
- [x] 7.3 A local end-to-end run: start `sync-service` with a scratch `EVENTS_DB_PATH` and a test token,
      point a `vite build` at it via `VITE_SYNC_ENDPOINT`/`VITE_SYNC_TOKEN`, file a report through `#report`
      in a browser, then run `pull-events.ts <scratch-db> --out-dir /tmp/reports-check` and confirm the
      line's `kind`, `message`, `buildId`, and `appEnv` are what the form produced.

## 8. On-device follow-up on the dev stack (per `AGENTS.md`; not part of automated verification)

- [ ] 8.1 Build with `--mode dev`, `docker restart shizi-gateway-dev`, open
      `https://shizi-dev.realxco.com/assessment/#report` on the iPad in standalone mode: the keyboard
      appears for the textarea, text can be selected and edited, typed Chinese renders as real glyphs, and
      the page does not scroll-jump — the `global.css` overrides from task 5.2 hold on real iOS.
- [ ] 8.2 File one bug and one feature report; `pull-events.ts --out-dir /tmp/dev-export` shows both with
      `appEnv: "dev"`, `buildId` equal to the short SHA, and `standalone: true`; `git status` shows
      `data/events/` unchanged.
- [ ] 8.3 Airplane mode: file a report, confirm `1 report waiting to be sent` on the form, leave airplane
      mode, relaunch, reopen the form and confirm the line is gone and the report is in dev's store — the
      offline-first scenario on a real device.
- [ ] 8.4 Reach the form the way a parent would, with no address bar: cold start → corner long-press →
      "Report a problem or idea" → file → Back → the unlock screen is showing again with no fragment.
