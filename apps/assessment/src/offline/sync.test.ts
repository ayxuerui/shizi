import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import type { ArmAssignment, SessionRating } from "@shizi/adaptivity";
import type { IssueReport } from "@shizi/issue-reports";
import { toJsonl } from "@shizi/learner-state";
import { __resetDBForTests } from "./db.js";
import {
  enqueueAssignments,
  enqueueEvent,
  enqueueIssueReport,
  enqueueRating,
  listPendingAssignments,
  listPendingEvents,
  listPendingIssueReports,
  listPendingRatings,
} from "./event-queue.js";
import { flushQueue } from "./sync.js";

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    module: "assess", activity: "hear-tap",
    outcome: "correct",
    latencyMs: 900,
    positionInSession: 0,
    priorExposureCount: 0,
    daysSinceLastExposure: null,
    timeOfDay: 9,
    adultPresent: true,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<ArmAssignment> = {}): ArmAssignment {
  return {
    character: "山",
    arm: "hear-tap",
    pairId: "pair-1",
    assignedAt: "2026-08-19T09:00:00.000Z",
    ...overrides,
  };
}

function makeRating(overrides: Partial<SessionRating> = {}): SessionRating {
  return {
    sessionId: "session-1",
    rating: "loved",
    recordedAt: "2026-08-19T09:00:00.000Z",
    ...overrides,
  };
}


function makeIssueReport(overrides: Partial<IssueReport> = {}): IssueReport {
  return {
    id: "report-1",
    kind: "bug",
    message: "The audio did not play for 山.",
    createdAt: "2026-08-29T10:00:00.000Z",
    context: {
      appEnv: "prod",
      buildId: "abc1234",
      userAgent: "Mozilla/5.0 (iPad)",
      standalone: true,
      online: false,
      lastSessionId: null,
      lastActivity: null,
    },
    ...overrides,
  };
}

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("flushQueue (task 9.2, assessment spec: 'Full offline operation')", () => {
  beforeEach(resetDatabase);
  afterEach(async () => {
    await resetDatabase();
    vi.unstubAllEnvs();
  });

  it("skips when no sync endpoint is configured — Section 9 not deployed", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "");
    const result = await flushQueue();
    expect(result.status).toBe("skipped");
  });

  it("skips when offline, without touching the queue", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);

    const result = await flushQueue({ isOnline: () => false });

    expect(result.status).toBe("skipped");
    expect(await listPendingEvents()).toEqual([event]);
  });

  it("flushes pending events to /events and marks them synced on a 2xx response", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result).toEqual({
      status: "flushed",
      eventsCount: 1,
      assignmentsCount: 0,
      ratingsCount: 0,
      issueReportsCount: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://sync.example.test/events", expect.anything());
    expect(await listPendingEvents()).toEqual([]);
  });

  it("flushes pending assignments to /assignments and marks them synced on a 2xx response", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const assignment = makeAssignment();
    await enqueueAssignments([assignment]);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result).toEqual({
      status: "flushed",
      eventsCount: 0,
      assignmentsCount: 1,
      ratingsCount: 0,
      issueReportsCount: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://sync.example.test/assignments", expect.anything());
    expect(await listPendingAssignments()).toEqual([]);
  });

  it("flushes pending ratings to /ratings and marks them synced on a 2xx response", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const rating = makeRating();
    await enqueueRating(rating);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result).toEqual({
      status: "flushed",
      eventsCount: 0,
      assignmentsCount: 0,
      ratingsCount: 1,
      issueReportsCount: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://sync.example.test/ratings", expect.anything());
    expect(await listPendingRatings()).toEqual([]);
  });

  it("flushes events, assignments, ratings, and issue reports together in one call", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    await enqueueEvent(makeEvent());
    await enqueueAssignments([makeAssignment()]);
    await enqueueRating(makeRating());
    await enqueueIssueReport(makeIssueReport());
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result).toEqual({
      status: "flushed",
      eventsCount: 1,
      assignmentsCount: 1,
      ratingsCount: 1,
      issueReportsCount: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  describe("issue reports (add-issue-reporting, issue-reporting spec: 'Reports are written offline-first and synced idempotently')", () => {
    it("posts pending reports to /issue-reports as NDJSON with the bearer token, and marks them synced on a 2xx", async () => {
      vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
      vi.stubEnv("VITE_SYNC_TOKEN", "test-token");
      const report = makeIssueReport();
      await enqueueIssueReport(report);
      const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

      const result = await flushQueue({ fetchImpl, isOnline: () => true });

      // A flush with ONLY a report pending is a real flush, not "nothing pending".
      expect(result).toEqual({
        status: "flushed",
        eventsCount: 0,
        assignmentsCount: 0,
        ratingsCount: 0,
        issueReportsCount: 1,
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "https://sync.example.test/issue-reports",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-ndjson", Authorization: "Bearer test-token" },
          body: toJsonl([report]),
        }),
      );
      expect(await listPendingIssueReports()).toEqual([]);
    });

    it("leaves the report pending on a non-2xx response without undoing the earlier, successful legs", async () => {
      vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
      await enqueueEvent(makeEvent());
      await enqueueIssueReport(makeIssueReport());
      const fetchImpl = vi.fn(
        async (url: RequestInfo | URL) =>
          new Response(null, { status: String(url).endsWith("/issue-reports") ? 500 : 200 }),
      );

      const result = await flushQueue({ fetchImpl, isOnline: () => true });

      expect(result).toEqual({ status: "failed", reason: "issue-reports HTTP 500" });
      expect(await listPendingEvents()).toEqual([]); // the events leg succeeded and stays synced
      expect(await listPendingIssueReports()).toHaveLength(1); // retried next time
    });

    it("a failed ratings flush does not attempt the issue-reports flush in the same call", async () => {
      vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
      await enqueueRating(makeRating());
      await enqueueIssueReport(makeIssueReport());
      const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

      const result = await flushQueue({ fetchImpl, isOnline: () => true });

      expect(result.status).toBe("failed");
      expect(fetchImpl).toHaveBeenCalledTimes(1); // stopped after /ratings failed
      expect(await listPendingIssueReports()).toHaveLength(1);
    });
  });

  it("a failed assignments flush does not attempt the ratings flush in the same call", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    await enqueueAssignments([makeAssignment()]);
    await enqueueRating(makeRating());
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result.status).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // stopped after /assignments failed
    expect(await listPendingRatings()).toHaveLength(1); // untouched, retried next time
  });

  it("leaves events pending and reports failure on a non-2xx response — never throws", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result.status).toBe("failed");
    expect(await listPendingEvents()).toEqual([event]);
  });

  it("a failed events flush does not attempt the assignments flush in the same call", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    await enqueueEvent(makeEvent());
    await enqueueAssignments([makeAssignment()]);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result.status).toBe("failed");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // stopped after /events failed
    expect(await listPendingAssignments()).toHaveLength(1); // untouched, retried next time
  });

  it("leaves events pending and reports failure when fetch itself throws — never throws", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(flushQueue({ fetchImpl, isOnline: () => true })).resolves.toMatchObject({
      status: "failed",
    });
    expect(await listPendingEvents()).toEqual([event]);
  });

  it("skips (rather than fails) when there is nothing pending to send", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const fetchImpl = vi.fn();
    const result = await flushQueue({ fetchImpl, isOnline: () => true });
    expect(result.status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
