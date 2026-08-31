import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { startBackupSchedule } from "./backup.js";
import { openEventStore } from "./db.js";
import {
  handleAssignmentsSync,
  handleEventsSync,
  handleIssueReportsSync,
  handleRatingsSync,
  type SyncRequestInput,
  type SyncDeps,
  type SyncResponseResult,
} from "./handle-sync.js";

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.EVENTS_DB_PATH ?? "./data/events.sqlite";
const BACKUP_DIR = process.env.BACKUP_DIR ?? "./data/backups";
const SYNC_SHARED_TOKEN = process.env.SYNC_SHARED_TOKEN;

if (!SYNC_SHARED_TOKEN) {
  // Fail loudly at boot rather than silently rejecting every request —
  // a missing token is a deploy-config mistake, not a runtime condition
  // to degrade gracefully from.
  console.error("SYNC_SHARED_TOKEN is not set — refusing to start.");
  process.exit(1);
}

const store = openEventStore(DB_PATH);
startBackupSchedule(store, BACKUP_DIR);

const ROUTES: Record<string, (input: SyncRequestInput, deps: SyncDeps) => SyncResponseResult> = {
  "/events": handleEventsSync,
  "/assignments": handleAssignmentsSync,
  "/ratings": handleRatingsSync,
  "/issue-reports": handleIssueReportsSync,
};

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendResult(res: ServerResponse, result: SyncResponseResult): void {
  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const handler = req.method === "POST" && req.url ? ROUTES[req.url] : undefined;
  if (handler) {
    const bodyText = await readBody(req);
    const result = handler(
      { authHeader: req.headers.authorization, bodyText },
      { expectedToken: SYNC_SHARED_TOKEN as string, store },
    );
    sendResult(res, result);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => {
    console.error("sync-service: request handler threw", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`sync-service listening on :${PORT}, db at ${DB_PATH}`);
});

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
