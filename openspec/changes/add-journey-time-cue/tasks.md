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

## 2. Pure fraction logic

- [x] 2.1 Create `apps/assessment/src/narrative/journey-progress.ts`: exports `PRE_CLOSING_CAP = 0.97` and
      `journeyFraction({ elapsedSinceStartMs, maxDurationMs, beatIndex, maxItems, complete })`. Rules:
      `complete` → exactly `1`. Otherwise `max(timeChannel, itemChannel)` clamped to `[0, PRE_CLOSING_CAP]`,
      where `timeChannel = maxDurationMs > 0 && elapsedSinceStartMs !== null ? elapsedSinceStartMs / maxDurationMs : 0`
      and `itemChannel = maxItems > 0 ? beatIndex / maxItems : 0`. `completionReason` is deliberately NOT an
      input — see design.md's "child never sees which bound fired" decision.
- [x] 2.2 `journey-progress.test.ts`: each channel alone; `max()` picking the larger channel in both
      directions (including the anti-saturation case: low `beatIndex` but high elapsed time, and vice
      versa); `elapsedSinceStartMs: null` → contributes 0, not `NaN`; `maxDurationMs: 0` / `maxItems: 0` →
      that channel contributes 0, never `Infinity`; capped at `PRE_CLOSING_CAP` even when elapsed time is
      many multiples of `maxDurationMs`, while `complete: false`; exactly `1` when `complete`, identical
      whether the scenario represents a duration-bound or an item-bound close (the structural guard for
      "child never sees which bound fired").

## 3. Visual component

- [x] 3.1 Create `apps/assessment/src/narrative/JourneyTrail.tsx`: renders a track (`height: 4px`,
      `borderRadius`, `background: var(--color-surface)`) and a fill (`background: var(--color-accent)`,
      `opacity: 0.3`) whose `style.width` is written directly via a ref inside a 1Hz interval effect — not
      `useState` (see design.md's rationale: avoids re-rendering `ProbePanel` every second and `act()`
      warning noise in existing timer-using tests). Reads
      `window.matchMedia?.("(prefers-reduced-motion: reduce)").matches` once and disables the CSS
      transition when true. `aria-hidden="true"` on the track (decorative; announcing a fraction to a
      screen reader would be exactly the numeric statement being avoided). Interval clears on unmount and
      once `complete` is true.
- [x] 3.2 `JourneyTrail.test.tsx` (fake timers, injected clock — no real waiting): fill starts at `0%`;
      advancing the injected clock + `vi.advanceTimersByTime(1000)` increases the fill width monotonically;
      `complete` → `100%`; `expect(container.textContent).toBe("")` and does not match `/\d/` — the
      no-digits guarantee asserted at THIS component's own level, not only trusted from `BoutScreen`'s
      existing assertion; fill's `background` contains `var(--color-accent)` only (structural guard against
      a future urgency color); unmount clears the interval (`vi.getTimerCount()` → 0); no interval remains
      once `complete`.

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
- [x] 5.2 Add one new `BoutScreen.test.tsx` case: during a `maxItems: 2` (or similar short) bout, a
      `journey-trail` testid exists mid-bout; once the closing beat is reached (`悟空到家了`), the trail's
      fill reads `100%`; finish with a final `assertNoScoreLikeText()` call.
- [x] 5.3 Confirm `session/bout-machine.ts` and `bout-machine.test.ts` are untouched — no new `BoutState`
      field, no edit to the exhaustive key-set assertion. Confirm `feedback/cues.ts`, `styles/tokens.css`,
      `copy.ts`, and `closing/ClosingBeat.tsx` are untouched.
- [x] 5.4 Run `npm run lint && npm run typecheck && npm test && npm run build` from the repo root (whole
      workspace, matching every prior change in this project) and `openspec validate add-journey-time-cue --strict`.
      Verified: 364 tests pass workspace-wide (up from 339), lint/typecheck/build all clean.

## 6. On-device follow-up (not part of this change's automated verification)

- [ ] 6.1 During `bootstrap-shizi-assessment` task 10.2's first real session, specifically watch whether
      the trail's motion is noticeable to the child during a hesitation, and whether it changes behavior —
      per design.md's honestly-stated risk. Record the observation; removing the `timing` prop is a
      two-line revert if warranted.
