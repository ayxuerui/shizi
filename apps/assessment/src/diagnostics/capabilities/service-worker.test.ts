import { describe, expect, it, vi } from "vitest";
import { describeEnvironment, probeServiceWorker } from "./service-worker.js";

describe("probeServiceWorker", () => {
  it("reports 'attention' when serviceWorker is not available at all", async () => {
    const results = await probeServiceWorker({});
    expect(results).toEqual([
      expect.objectContaining({ id: "sw-supported", status: "attention" }),
    ]);
  });

  it("reports controller presence", async () => {
    const results = await probeServiceWorker({ serviceWorker: { controller: {} } });
    expect(results.find((r) => r.id === "sw-controller")?.status).toBe("ok");
  });

  it("reports 'attention' when there is no controller", async () => {
    const results = await probeServiceWorker({ serviceWorker: { controller: undefined } });
    expect(results.find((r) => r.id === "sw-controller")?.status).toBe("attention");
  });

  it("uses ignoreSearch: true when matching precached assets — a real bug guard, not a tautology", async () => {
    const match = vi.fn(async (_url: string, options?: { ignoreSearch?: boolean }) => (options?.ignoreSearch ? true : null));
    const results = await probeServiceWorker({
      serviceWorker: { controller: {} },
      caches: {
        keys: async () => ["workbox-precache-v1"],
        open: async () => ({ match }),
      },
      criticalPaths: ["fonts/LXGWWenKai-subset.woff2"],
    });

    expect(match).toHaveBeenCalledWith("fonts/LXGWWenKai-subset.woff2", { ignoreSearch: true });
    expect(results.find((r) => r.id === "sw-precache-assets")?.status).toBe("ok");
  });

  it("reports which critical assets are missing from every cache", async () => {
    const results = await probeServiceWorker({
      serviceWorker: { controller: {} },
      caches: {
        keys: async () => ["workbox-precache-v1"],
        open: async () => ({ match: async () => null }),
      },
      criticalPaths: ["fonts/LXGWWenKai-subset.woff2", "icons/icon-192.png"],
    });

    const check = results.find((r) => r.id === "sw-precache-assets");
    expect(check?.status).toBe("attention");
    expect(check?.detail).toContain("fonts/LXGWWenKai-subset.woff2");
    expect(check?.detail).toContain("icons/icon-192.png");
  });
});

describe("describeEnvironment", () => {
  it("reports standalone display-mode and legacy iOS standalone flag", () => {
    const info = describeEnvironment({
      matchMedia: () => ({ matches: true }),
      navigatorStandalone: true,
      isOnline: () => false,
    });
    expect(info).toEqual({ standalone: true, legacyIosStandalone: true, online: false });
  });

  it("defaults online to true and standalone to false when nothing is injected", () => {
    expect(describeEnvironment({})).toEqual({ standalone: false, legacyIosStandalone: undefined, online: true });
  });
});
