## Why

Parents playing this with their child want a sense of how far along a bout is, but the `assessment`
spec's "No visible scoring or failure state" requirement is enforced strictly (a digit-free DOM is
asserted by tests, `BoutState` has no room for a numeric field, there is no error/urgency color token).
A literal countdown or clock was considered and rejected for exactly that reason — it would be pressure
dressed as a feature, not just a spec violation. This proposes the constraint-respecting version instead:
a purely visual, non-numeric progress cue that extends the existing beat-based narrative rather than
adding a clock face.

It also closes a real, if minor, gap already latent in the existing beat display: the 6-stone path
saturates after item 6 of a possible 30, so a longer bout currently looks "stuck" well before it's
actually close to ending.

## What Changes

- `NarrativeStage` gains TWO thin, continuously-filling trails behind its existing 6-stone path — one
  reflecting elapsed time ÷ max duration, one reflecting items answered ÷ max items — shown
  independently rather than blended into a single number via `max()`. Each is an honest read of its own
  bound; neither is hidden behind the other. (Revised from the original single-blended-trail design —
  see design.md's "Two independent trails" decision for why.)
- Both trails fill, never drain; use no new color (only the existing `--color-accent` tint, at low
  opacity); show no digits, no percentage, no clock text anywhere.
- Each trail always reaches exactly full at the closing beat, regardless of which bound actually fired —
  preserving the existing "the child never sees which bound fired" property for both channels.
- A new session-side clock wrapper (`session/session-clock.ts`) is introduced so the elapsed-time
  computation lives entirely outside `BoutState`/the reducer, which stays untouched. As a side effect,
  this fixes a latent, minor bug: the app today never injects the engine's `elapsedMs` dependency at all,
  so it silently falls back to `Date.now()` (not monotonic — an NTP/wall-clock step could visibly move
  the 90s bound). The new wrapper injects `performance.now()` instead.
- **Not a breaking change** — additive props on `NarrativeStage`/`BoutScreen`, no existing prop or
  behavior is removed or altered.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `assessment`: adds one additive scenario under the existing "Narrative framing" requirement stating
  the elapsed-progress cue must be non-numeric and must not indicate correctness or urgency — a guard
  against a future contributor adding a countdown/clock here without revisiting this decision. No
  existing requirement text changes; nothing about "No visible scoring or failure state" is loosened.

## Impact

- `apps/assessment/src/narrative/NarrativeStage.tsx` — two new optional props (`timing`, `complete`);
  renders unchanged when omitted.
- `apps/assessment/src/session/use-assessment-session.ts` — builds and injects the new session clock;
  returns a new `timing` value alongside its existing return values.
- `apps/assessment/src/bout/BoutScreen.tsx` — passes the two new props through.
- New files: `apps/assessment/src/session/session-clock.ts`, `apps/assessment/src/narrative/journey-progress.ts`
  (exports two independent channel fractions, not one blended value), `apps/assessment/src/narrative/JourneyTrail.tsx`
  (renders two independent trails) (each with a test file).
- Explicitly untouched: `session/bout-machine.ts` and its exhaustive `BoutState` key-set test,
  `feedback/cues.ts`, `styles/tokens.css`, `copy.ts`, `closing/ClosingBeat.tsx`, everything under
  `packages/`. `BoutScreen.test.tsx`'s existing `assertNoScoreLikeText()` assertions must keep passing
  unmodified — that's this change's primary regression signal.
