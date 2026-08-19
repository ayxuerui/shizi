import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetDBForTests } from "../../offline/db.js";
import { probeStorage, requestPersistence } from "./storage.js";

function fakeLocalStorage(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
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

describe("probeStorage", () => {
  beforeEach(resetDatabase);
  afterEach(resetDatabase);

  it("records a first-open marker in localStorage when none exists yet", async () => {
    const local = fakeLocalStorage();
    const results = await probeStorage({ local });
    const marker = results.find((r) => r.id === "storage-first-open");
    expect(marker?.status).toBe("ok");
    expect(marker?.detail).toContain("Recorded now");
  });

  it("reports the existing marker on a second run, without overwriting it", async () => {
    const local = fakeLocalStorage();
    await probeStorage({ local });
    const results = await probeStorage({ local });
    const marker = results.find((r) => r.id === "storage-first-open");
    expect(marker?.detail).toContain("First recorded at");
  });

  it("confirms the real IndexedDB connection opens successfully (reuses offline/db.ts's getDB)", async () => {
    const results = await probeStorage({});
    const idb = results.find((r) => r.id === "storage-indexeddb");
    expect(idb?.status).toBe("ok");
  });

  it("reports 'attention' if the IndexedDB connection fails", async () => {
    const results = await probeStorage({
      openDb: async () => {
        throw new Error("blocked");
      },
    });
    const idb = results.find((r) => r.id === "storage-indexeddb");
    expect(idb?.status).toBe("attention");
  });

  it("reports estimate() usage/quota when supported", async () => {
    const results = await probeStorage({
      storage: { estimate: async () => ({ usage: 100, quota: 1000 }) },
    });
    const estimate = results.find((r) => r.id === "storage-estimate");
    expect(estimate?.status).toBe("ok");
    expect(estimate?.detail).toContain("usage=100");
  });

  it("reports 'unknown' when estimate() is not supported", async () => {
    const results = await probeStorage({});
    const estimate = results.find((r) => r.id === "storage-estimate");
    expect(estimate?.status).toBe("unknown");
  });
});

describe("requestPersistence (never called on mount — only from an explicit button)", () => {
  it("reports 'ok' when persist() grants", async () => {
    const result = await requestPersistence({ persist: async () => true });
    expect(result.status).toBe("ok");
  });

  it("reports 'attention' when persist() is denied", async () => {
    const result = await requestPersistence({ persist: async () => false });
    expect(result.status).toBe("attention");
  });

  it("reports 'unknown' when persist() is not supported", async () => {
    const result = await requestPersistence(undefined);
    expect(result.status).toBe("unknown");
  });
});
