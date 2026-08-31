import { MAX_CONTEXT_FIELD_LENGTH, type IssueReportContext } from "@shizi/issue-reports";
import type { LearnerEvent } from "@shizi/learner-state";
import { describeEnvironment, type SwProbeDeps } from "../diagnostics/capabilities/service-worker.js";

export interface IssueContextDeps {
  /** `VITE_APP_ENV` — undefined in a production build, which reads as "prod". */
  appEnv: string | undefined;
  /** `VITE_BUILD_ID` — undefined when no id was stamped in, which reads as "unknown". */
  buildId: string | undefined;
  userAgent: string;
  matchMedia?: NonNullable<SwProbeDeps["matchMedia"]>;
  navigatorStandalone?: boolean;
  isOnline: () => boolean;
  loadPriorEvents: () => Promise<readonly LearnerEvent[]>;
}

function bounded(value: string): string {
  return value.length > MAX_CONTEXT_FIELD_LENGTH ? value.slice(0, MAX_CONTEXT_FIELD_LENGTH) : value;
}

/** The most recent event by `timestamp` — a derived read over the same
 * local history `PracticeRouter` already uses, not a new "current
 * session" state threaded through the session layer (add-issue-reporting
 * design.md). */
function mostRecent(events: readonly LearnerEvent[]): LearnerEvent | null {
  let latest: LearnerEvent | null = null;
  for (const event of events) {
    if (latest === null || event.timestamp > latest.timestamp) latest = event;
  }
  return latest;
}

/**
 * `issue-reporting` spec's "Reports carry diagnostic context
 * automatically": everything a report records without the adult typing
 * it. A pure function of injected dependencies so it's testable in jsdom
 * with scripted values; `IssueReportScreen.tsx` supplies the real ones.
 * Reuses `describeEnvironment` for the standalone/online pair rather than
 * re-deriving it. String fields are clamped to the shared bound so a
 * long user-agent string can never make an otherwise valid report fail
 * validation.
 */
export async function collectIssueContext(deps: IssueContextDeps): Promise<IssueReportContext> {
  const environment = describeEnvironment({
    ...(deps.matchMedia ? { matchMedia: deps.matchMedia } : {}),
    ...(deps.navigatorStandalone !== undefined ? { navigatorStandalone: deps.navigatorStandalone } : {}),
    isOnline: deps.isOnline,
  });

  let events: readonly LearnerEvent[] = [];
  try {
    events = await deps.loadPriorEvents();
  } catch {
    // A storage failure must not make the report unwritable — the session
    // fields are context, not the report itself.
  }
  const latest = mostRecent(events);

  return {
    appEnv: bounded(deps.appEnv || "prod"),
    buildId: bounded(deps.buildId || "unknown"),
    userAgent: bounded(deps.userAgent),
    standalone: environment.standalone || environment.legacyIosStandalone === true,
    online: environment.online,
    lastSessionId: latest ? bounded(latest.sessionId) : null,
    lastActivity: latest ? bounded(`${latest.module}/${latest.activity}`) : null,
  };
}
