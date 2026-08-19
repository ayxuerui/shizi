import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearnerEvent } from "@shizi/learner-state";
import { __resetDBForTests } from "./db.js";
import { enqueueEvent, listPendingEvents } from "./event-queue.js";
import { flushQueue } from "./sync.js";

function makeEvent(overrides: Partial<LearnerEvent> = {}): LearnerEvent {
  return {
    id: "evt-1",
    timestamp: "2026-08-19T09:00:00.000Z",
    sessionId: "session-1",
    character: "山",
    modality: "hear-tap",
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

async function resetDatabase(): Promise<void> {
  await __resetDBForTests();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("shizi-assessment");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe("flushQueue (task 8.2, assessment spec: 'Full offline operation')", () => {
  beforeEach(resetDatabase);
  afterEach(async () => {
    await resetDatabase();
    vi.unstubAllEnvs();
  });

  it("skips when no sync endpoint is configured — Section 9 doesn't exist yet", async () => {
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

  it("flushes pending events and marks them synced on a 2xx response", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await flushQueue({ fetchImpl, isOnline: () => true });

    expect(result).toEqual({ status: "flushed", count: 1 });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(await listPendingEvents()).toEqual([]);
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

  it("leaves events pending and reports failure when fetch itself throws — never throws", async () => {
    vi.stubEnv("VITE_SYNC_ENDPOINT", "https://sync.example.test");
    const event = makeEvent();
    await enqueueEvent(event);
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await expect(flushQueue({ fetchImpl, isOnline: () => true })).resolves.toMatchObject({
      status: "failed",
    });
    void result;
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
