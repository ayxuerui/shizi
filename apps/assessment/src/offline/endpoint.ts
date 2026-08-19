export interface SyncConfig {
  endpoint: string;
  token: string | undefined;
}

/**
 * Section 9 (Cloudflare Worker + D1 sync endpoint) doesn't exist yet, so
 * both env vars are legitimately undefined for the whole lifetime of
 * this pass. Same documented-stub idiom as `curriculum`'s word-unlock/
 * story-unlock factors: a real, wired seam that reports "nothing to sync
 * to yet" rather than fabricating a fake endpoint to point at.
 */
export function getSyncConfig(): SyncConfig | null {
  const endpoint = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined;
  if (!endpoint) return null;
  return {
    endpoint,
    token: import.meta.env.VITE_SYNC_TOKEN as string | undefined,
  };
}
