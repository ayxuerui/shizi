# AGENTS.md — real-browser verification workflow

How to verify changes in an actual browser, and the environment quirks that
will waste your time if you don't know them.

## The browser is not on this machine

The `chrome-devtools` MCP server (configured globally in
`~/.config/opencode/opencode.jsonc`) attaches via `--browserUrl` to a
long-lived Chrome whose CDP endpoint listens on `127.0.0.1:9223`. That Chrome
runs on a **different machine** than this checkout:

- It **cannot reach `localhost:*` or `127.0.0.1:*` here**. A locally started
  vite/preview server is invisible to it. Never verify against one.
- Verify through **`https://shizi-dev.realxco.com/assessment/`** after
  shipping a build to the dev stack (below).
- Drive only tabs you create yourself; leave any existing tabs alone.
- If the remote Chrome has exited and the MCP fails to connect, remove the
  `--browserUrl` flag from the global config so chrome-devtools-mcp launches
  its own headless Chrome instead.

## Shipping a candidate build to dev

From this checkout (the `gateway-dev` container bind-mounts *this tree's*
`apps/assessment/dist`):

```sh
npm run build --workspace=apps/assessment -- --mode dev
docker restart shizi-gateway-dev
```

- **npm pitfall:** the `-- --mode dev` above is appended to the END of the
  whole `&&`-chained build script, so vite never sees it — the build then
  ships with production identity (manifest "shizi", no `DEV` badge). If the
  unlock screen lacks the badge, build vite directly instead:
  ```sh
  (cd apps/assessment && npx vite build --mode dev && node scripts/check-precache.mjs)
  docker restart shizi-gateway-dev
  ```

- `--mode dev` is what makes it identifiable: PWA installs as "shizi dev",
  and a small `DEV` badge shows on the unlock/diagnostics screens only —
  never inside an activity bout.
- **The restart is not optional.** vite empties and recreates `dist/`, and
  Docker bind mounts pin the directory's inode at mount time; without a
  container restart the gateway serves stale (or 403/404) content. Same rule:
  never `rm -rf apps/assessment/dist` while `gateway-dev` is running without
  restarting it afterward.
- Production is unaffected by dev rebuilds: `shizi-gateway` serves a baked
  image, not this working tree. Still, only **one dev stack** can run at a
  time (`container_name` is hardcoded) — see infra/README.md.

## What "working" looks like on dev

- Unlock screen renders 点一下开始 with the `DEV` badge.
- `GET /assessment/config.json` returning **404 is expected**: no plan has
  been published for dev, and `published-config.ts` deliberately falls back
  to its built-in pool on any failure. Don't treat it as a bug.
- A fresh browser profile starts with the learn/exposure activity; completing
  activities advances the learn → assess rotation with no console errors.
- `https://shizi-dev.realxco.com/assessment/#report` opens the adult-facing
  bug-report/feature-request form (add-issue-reporting); on-device it is
  reached from the diagnostics screen's "Report a problem or idea" button.
  A report filed on dev must land in dev's own store — check with
  `docker exec shizi-sync-dev npx tsx scripts/pull-events.ts --out-dir /tmp/dev-export`
  then `docker exec shizi-sync-dev cat /tmp/dev-export/issue-reports.jsonl` —
  and must never touch `data/events/` in this checkout.
