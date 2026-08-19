export interface SyncConfig {
  /** Base URL of the self-hosted sync service (`infra/sync-service`) —
   * e.g. the Cloudflare-tunnel hostname for it. `sync.ts` appends
   * `/events` and `/assignments`, the service's two routes. */
  endpoint: string;
  token: string | undefined;
}

/**
 * Until this is actually deployed (see `infra/README.md` for the setup
 * steps — self-hosted per design.md, not Cloudflare Pages/Worker/D1),
 * both env vars are legitimately undefined. Same documented-stub idiom
 * as `curriculum`'s word-unlock/story-unlock factors: a real, wired seam
 * that reports "nothing to sync to yet" rather than fabricating a fake
 * endpoint to point at.
 */
export function getSyncConfig(): SyncConfig | null {
  const endpoint = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined;
  if (!endpoint) return null;
  return {
    endpoint,
    token: import.meta.env.VITE_SYNC_TOKEN as string | undefined,
  };
}
