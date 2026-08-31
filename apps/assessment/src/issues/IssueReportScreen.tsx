import { useEffect, useRef, useState } from "react";
import {
  ISSUE_KINDS,
  MAX_MESSAGE_LENGTH,
  type IssueKind,
  type IssueReport,
  type IssueReportContext,
} from "@shizi/issue-reports";
import { EnvBadge } from "../components/EnvBadge.js";
import { enqueueIssueReport, listPendingIssueReports, loadPriorEvents } from "../offline/event-queue.js";
import { flushQueue } from "../offline/sync.js";
import { collectIssueContext } from "./issue-context.js";

/**
 * A SYSTEM font stack, deliberately not `var(--font-hanzi)`: `global.css`
 * puts the subsetted LXGW WenKai font on `body`, and the subset only
 * contains the pool/identity characters plus `copy.ts`'s own UI text
 * (see that file's header comment). This screen is the one place in the
 * app where free text is TYPED, in any script — a parent writing 山 or a
 * character that isn't in the subset would otherwise see tofu. Module-
 * local, like `diagnostics/theme.ts`'s font, not a new shared token.
 */
export const ISSUE_REPORT_FONT_FAMILY =
  'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Segoe UI", sans-serif';

export interface IssueReportScreenDeps {
  enqueue: (report: IssueReport) => Promise<void>;
  listPending: () => Promise<readonly IssueReport[]>;
  flush: () => void;
  collectContext: () => Promise<IssueReportContext>;
  newId: () => string;
  now: () => string;
}

export interface IssueReportScreenProps {
  onExit: () => void;
  onSubmitted?: (report: IssueReport) => void;
  /** Every dependency defaults to the real thing; tests inject scripted ones. */
  deps?: Partial<IssueReportScreenDeps>;
}

function defaultCollectContext(): Promise<IssueReportContext> {
  const legacyStandalone = (window.navigator as { standalone?: boolean }).standalone;
  // jsdom (and conceivably a very old browser) has no matchMedia at all.
  const hasMatchMedia = typeof window.matchMedia === "function";
  return collectIssueContext({
    appEnv: import.meta.env.VITE_APP_ENV as string | undefined,
    buildId: import.meta.env.VITE_BUILD_ID as string | undefined,
    userAgent: navigator.userAgent,
    ...(hasMatchMedia ? { matchMedia: (q: string) => window.matchMedia(q) } : {}),
    ...(legacyStandalone !== undefined ? { navigatorStandalone: legacyStandalone } : {}),
    isOnline: () => navigator.onLine,
    loadPriorEvents,
  });
}

const KIND_LABELS: Record<IssueKind, string> = {
  bug: "Something went wrong",
  feature: "I have an idea",
};

function pendingLine(count: number): string {
  return `${count} ${count === 1 ? "report" : "reports"} waiting to be sent`;
}

/**
 * add-issue-reporting (`issue-reporting` spec): the adult-facing form for
 * a bug report or feature request. Parent-facing, English/ASCII labels
 * ONLY — like `DiagnosticsScreen`, this is out-of-band tooling, and any
 * Chinese label here would need a font-subset rebuild for no benefit
 * (see `copy.ts`'s header comment; nothing here is added to it). The
 * parent's own typed text is the exception, and it renders in
 * `ISSUE_REPORT_FONT_FAMILY` above for exactly that reason.
 *
 * Never mounted alongside the child-facing tree: `App.tsx` renders
 * EITHER this OR `AudioUnlockGate`/`PracticeRouter`, never both — the
 * same either/or containment `DiagnosticsScreen` relies on, which is what
 * keeps `BoutScreen.test.tsx`'s `assertNoScoreLikeText` guarantee
 * structural (this screen's digits — the character counter, the pending
 * count — never enter that tree).
 *
 * Saving is offline-first: the report goes to the local outbox
 * (`enqueueIssueReport`) and a flush is fired-and-forgotten, exactly like
 * events and ratings. The confirmation therefore promises "saved on this
 * device", never "sent" — that's the truthful claim.
 */
export function IssueReportScreen({ onExit, onSubmitted, deps }: IssueReportScreenProps) {
  const enqueue = deps?.enqueue ?? enqueueIssueReport;
  const listPending = deps?.listPending ?? listPendingIssueReports;
  const flush =
    deps?.flush ??
    (() => {
      void flushQueue(); // fire-and-forget — a sync failure must never surface here as an error.
    });
  const collectContext = deps?.collectContext ?? defaultCollectContext;
  const newId = deps?.newId ?? (() => crypto.randomUUID());
  const now = deps?.now ?? (() => new Date().toISOString());

  const [kind, setKind] = useState<IssueKind>("bug");
  const [message, setMessage] = useState("");
  const [phase, setPhase] = useState<"editing" | "saved">("editing");
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function refreshPending(): Promise<void> {
    try {
      const pending = await listPending();
      if (mountedRef.current) setPendingCount(pending.length);
    } catch {
      // Informational only — a storage hiccup must not break the form.
    }
  }

  useEffect(() => {
    void refreshPending();
    // Once per mount: the count is refreshed again after each save below.
  }, []);

  const trimmed = message.trim();
  const canSave = trimmed.length > 0 && !saving;

  async function save(): Promise<void> {
    if (!canSave) return;
    setSaving(true);
    try {
      const context = await collectContext();
      const report: IssueReport = { id: newId(), kind, message: trimmed, createdAt: now(), context };
      await enqueue(report);
      flush();
      onSubmitted?.(report);
      if (!mountedRef.current) return;
      setMessage("");
      setPhase("saved");
      await refreshPending();
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  return (
    <div style={{ fontFamily: ISSUE_REPORT_FONT_FAMILY, padding: "1rem", maxWidth: "640px", margin: "0 auto" }}>
      <EnvBadge />
      <h1 style={{ fontSize: "1.1rem" }}>Report a problem or idea</h1>

      {phase === "saved" ? (
        <div>
          <p>Saved on this device. It is sent automatically the next time the app is online.</p>
          <button type="button" onClick={() => setPhase("editing")}>
            Write another
          </button>{" "}
          <button type="button" onClick={onExit}>
            Back
          </button>
        </div>
      ) : (
        <div>
          <div role="group" aria-label="Kind of report" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {ISSUE_KINDS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                style={{ fontWeight: kind === option ? 700 : 400 }}
              >
                {KIND_LABELS[option]}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Report message"
            value={message}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={6}
            placeholder="What happened, or what would help?"
            onChange={(event) => setMessage(event.target.value)}
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "0.75rem",
              padding: "0.5rem",
              fontSize: "1rem",
              fontFamily: ISSUE_REPORT_FONT_FAMILY,
              // global.css disables selection/callouts and restricts
              // touch-action on <body> for stylus reasons; an editable
              // control needs them back — locally, on this one element.
              userSelect: "text",
              WebkitUserSelect: "text",
              touchAction: "auto",
            }}
          />
          <div style={{ fontSize: "0.85rem", color: "#5a5248", marginTop: "0.25rem" }}>
            {message.length} / {MAX_MESSAGE_LENGTH}
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" onClick={() => void save()} disabled={!canSave}>
              Save report
            </button>{" "}
            <button type="button" onClick={onExit}>
              Back
            </button>
          </div>
        </div>
      )}

      {pendingCount > 0 && <p style={{ fontSize: "0.85rem", marginTop: "1rem" }}>{pendingLine(pendingCount)}</p>}
    </div>
  );
}
