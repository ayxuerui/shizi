export type Rating = "loved" | "fine" | "checked-out";

export interface RatingRecord {
  sessionId: string;
  rating: Rating;
  recordedAt: string;
}

/**
 * Task 7.4's one-tap parent rating (loved it / fine / checked out),
 * linked to session id, always skippable and non-blocking (every
 * assessment event is already persisted regardless of whether a rating
 * is ever given).
 *
 * Durable storage of the rating itself is out of scope for this pass —
 * flagged as a schema follow-up, not invented on the spot:
 * `learner-state`'s `EventLog` is character-keyed, not a natural fit for
 * a once-per-session record. For now this logs the interaction so it's
 * real and testable; wiring durable storage is a small, separate
 * follow-up once that schema is decided.
 */
export function recordRating(record: RatingRecord): void {
  console.info("parent rating recorded (not yet durably stored — see rating.ts)", record);
}
