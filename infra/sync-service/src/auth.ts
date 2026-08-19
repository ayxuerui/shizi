import { timingSafeEqual } from "node:crypto";

/**
 * Task 9.3: shared-token auth on the sync endpoint. Constant-time
 * comparison — a naive `===` check leaks how many leading bytes of a
 * guessed token matched via response-timing differences; cheap to avoid
 * even for a single-family, low-stakes endpoint (design.md's "Auth:
 * shared token, not accounts" decision already accepts a leaked token as
 * a real risk — this at least doesn't make guessing it easier).
 */
export function checkAuth(authHeader: string | undefined | null, expectedToken: string): boolean {
  if (!authHeader) return false;

  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length);

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expectedToken);

  // timingSafeEqual throws on mismatched lengths rather than returning
  // false — a length check up front handles the common "wrong length
  // guess" case without relying on catching that.
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
