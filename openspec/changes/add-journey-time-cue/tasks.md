## 1. Session-side clock

- [x] 1.1 Create `apps/assessment/src/session/session-clock.ts`: `createSessionClock()` factory returning
      `{ elapsedMs, elapsedSinceStartMs }`. `elapsedMs` defaults to `performance.now()` (overridable, so
      tests can inject a scripted clock); it is the function passed straight into the engine's
      `SessionDeps.elapsedMs`, so the engine's own constructor-latched origin IS the trail's origin, not a
      second reading that could drift. `elapsedSinceStartMs()` returns `null` until `elapsedMs()` has been
      called at least once (i.e. until the engine actually exists) and must NOT itself trigger the latch.
- [x] 1.2 `session-clock.test.ts`: covers `elapsedSinceStartMs()` being `null` before first `elapsedMs()`
      call; the first call latching; calling `elapsedSinceStartMs()` first does NOT latch (regression guard);
      a scripted clock producing an `elapsedMs()`/`elapsedSinceStartMs()` pair that agree exactly; clamped to
      ≥ 0 if the injected clock ever reports a backwards value.

## 2. Pure channel logic

- [x] 2.1 Rework `apps/assessment/src/narrative/journey-progress.ts`: exports `PRE_CLOSING_CAP = 0.97` and
      `journeyChannels({ elapsedSinceStartMs, maxDurationMs, beatIndex, maxItems, complete })` (renamed
      from `journeyFraction`, and no longer returns a single blended number — see design.md's "Two
      independent trails" decision, revised from the original single-`max()`-trail design). Returns
      `{ timeFraction, itemFraction }`. Rules per channel: `complete` → exactly `1` for both. Otherwise
      each is clamped to `[0, PRE_CLOSING_CAP]` independently:
      `timeFraction = maxDurationMs > 0 && elapsedSinceStartMs !== null ? elapsedSinceStartMs / maxDurationMs : 0`,
      `itemFraction = maxItems > 0 ? beatIndex / maxItems : 0`. No blending between the two.
      `completionReason` is deliberately NOT an input to either — see design.md's "child never sees which
      bound fired" decision (now applied per channel).
- [x] 2.2 `journey-progress.test.ts`: each channel computed independently and correctly (no more `max()`
      cross-channel test — there's no blending to test); `elapsedSinceStartMs: null` → `timeFraction` is 0,
      not `NaN`; `maxDurationMs: 0` / `maxItems: 0` → that channel is 0, never `Infinity`; each channel
      capped at `PRE_CLOSING_CAP` independently even when its own input is many multiples past its bound,
      while `complete: false`; both channels exactly `1` when `complete`, identical whether the scenario
      represents a duration-bound or an item-bound close (the structural guard for "child never sees which
      bound fired," now asserted for both channels).

## 3. Visual component

- [x] 3.1 Rework `apps/assessment/src/narrative/JourneyTrail.tsx`: renders TWO tracks (`height: 3px`,
      `borderRadius`, `background: var(--color-surface)`), stacked without overlapping, each with its own
      fill (`background: var(--color-accent)`, `opacity: 0.3`) — one bound to `timeFraction`
      (`journey-trail-time`), one to `itemFraction` (`journey-trail-item`). Both fills' `style.width` are
      written directly via refs inside a SHARED 1Hz interval effect (one timer drives both, not two) — not
      `useState` (see design.md's rationale). Reads
      `window.matchMedia?.("(prefers-reduced-motion: reduce)").matches` once and disables the CSS
      transition on both when true. `aria-hidden="true"` on the outer container (decorative). The shared
      interval clears on unmount and once `complete` is true.
- [x] 3.2 `JourneyTrail.test.tsx` (fake timers, injected clock — no real waiting): BOTH fills start at
      `0%`; the time fill advances independent of item progress and vice versa (proving there's no hidden
      blending); `complete` → both `100%`; `expect(container.textContent).toBe("")` and does not match
      `/\d/`; both fills' `background` contain `var(--color-accent)` only; unmount clears the shared
      interval (`vi.getTimerCount()` → 0); no interval remains once `complete`.

## 4. Wiring

- [x] 4.1 `apps/assessment/src/session/use-assessment-session.ts`: build one `createSessionClock()` per
      mount (`useMemo`, empty deps); pass `elapsedMs: clock.elapsedMs` into the engine's `deps` (merged with
      any test-injected `deps`, not replacing them); export a new `SessionTiming` interface
      (`{ elapsedSinceStartMs, maxDurationMs, maxItems }`) resolved from `config ?? DEFAULT_ASSESSMENT_SESSION_CONFIG`;
      return it as `timing` alongside the existing `state`/`submitResponse`/`rate`/`skipRating`. Additive
      only — no existing field, behavior, or default changes.
- [x] 4.2 `apps/assessment/src/narrative/NarrativeStage.tsx`: add two OPTIONAL props, `timing?: SessionTiming`
      and `complete?: boolean`. Wrap the existing stone row in a `position: relative` container; render
      `<JourneyTrail>` behind it only when `timing` is provided (so the component still renders exactly as
      today when called with just `beatIndex`, e.g. from any test that doesn't pass the new props). Extend
      the existing "stones encode beats elapsed" doc comment to describe the second, additive channel —
      do not remove or rewrite that paragraph, it remains true.
- [x] 4.3 `apps/assessment/src/bout/BoutScreen.tsx`: pass `timing={timing}` and
      `complete={state.phase === "closing" || state.phase === "done"}` to `NarrativeStage` (from the new
      `timing` return value added in 4.1).

## 5. Regression + new coverage

- [x] 5.1 Run the full existing `BoutScreen.test.tsx` suite unmodified — all five `assertNoScoreLikeText()`
      call sites must keep passing exactly as before. This is the change's primary regression signal.
- [x] 5.2 Update the existing `BoutScreen.test.tsx` case (added for the single-trail version): during a
      `maxItems: 2` (or similar short) bout, a `journey-trail` testid exists mid-bout; once the closing
      beat is reached (`悟空到家了`), BOTH trails' fills read `100%` (was: the single fill); finish with a
      final `assertNoScoreLikeText()` call.
- [x] 5.3 Confirm `session/bout-machine.ts` and `bout-machine.test.ts` are untouched — no new `BoutState`
      field, no edit to the exhaustive key-set assertion. Confirm `feedback/cues.ts`, `styles/tokens.css`,
      `copy.ts`, and `closing/ClosingBeat.tsx` are untouched.
- [x] 5.4 Run `npm run lint && npm run typecheck && npm test && npm run build` from the repo root (whole
      workspace, matching every prior change in this project) and `openspec validate add-journey-time-cue --strict`.
      Verified for the two-trail rework: 366 tests pass workspace-wide, lint/typecheck/build all clean,
      validate passes.

## 6. On-device follow-up (not part of this change's automated verification)

- [ ] 6.1 During `bootstrap-shizi-assessment` task 10.2's first real session, specifically watch whether
      the trail's motion is noticeable to the child during a hesitation, and whether it changes behavior —
      per design.md's honestly-stated risk. Record the observation; removing the `timing` prop is a
      two-line revert if warranted.
