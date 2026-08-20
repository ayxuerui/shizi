## Context

See `proposal.md` for motivation. The constraints this design has to work inside, all already enforced
today, not just conventions:

- `apps/assessment/src/bout/BoutScreen.test.tsx`'s `assertNoScoreLikeText()` asserts `document.body.textContent`
  has zero digits and no `%`, across a full scripted bout including the closing beat.
- `apps/assessment/src/session/bout-machine.ts`'s `BoutState` has its exact key set asserted in
  `bout-machine.test.ts` (`Object.keys(state).sort()).toEqual([...].sort())`) — no room for a new field.
- `apps/assessment/src/feedback/cues.ts`'s `CueKind` union has no error/urgency member.
- `apps/assessment/src/styles/tokens.css` has no `--color-error`/`--color-danger` token at all — only
  `--color-bg`, `--color-ink`, `--color-accent` (amber, documented as "used for acknowledge highlight, not
  error"), `--color-surface`.
- `apps/assessment/src/narrative/NarrativeStage.tsx` today renders 6 stones from `beatIndex` alone, capped
  at `STONE_COUNT = 6` while `AssessmentSessionConfig.maxItems` defaults to 30 — so the stones already
  visually saturate well before a long bout is actually close to ending.
- `packages/assessment-engine/src/session.ts`'s `nextProbe()` checks `elapsedMs() - startElapsedMs >=
  maxDurationMs` (default 90_000) before checking `probesIssued >= maxItems` (default 30). `elapsedMs` is
  an injectable `SessionDeps` member; the app does not currently inject it, so the engine falls back to
  its own default of `Date.now()`. Elapsed/remaining time is never exposed publicly — the only return is
  `{status:"session-complete", reason:"duration"|"item-count"}`.

## Goals / Non-Goals

**Goals:**
- A continuously-updating, purely graphical indication of how close the current bout is to ending.
- Zero risk of the indication reading as urgency, correctness, or a deadline.
- No change to `BoutState`, the reducer, or any existing test's assertions.

**Non-Goals:**
- Fixing the pre-existing engine behavior where an abandoned bout (stuck in `probing`, never responded to)
  can run past `maxDurationMs` without closing — `nextProbe()` is only evaluated after a response. This
  design works around the visible symptom (see the 97% cap below) without touching the engine.
- Making the 6-stone path itself time-aware. The stones stay exactly as they are today (discrete,
  per-answer); this design adds a separate, additive visual layer rather than changing their meaning.

## Decisions

**Two independent trails, not one `max()`-blended bar — and not folding time into the stones
themselves.** An earlier version of this design blended both channels into one number specifically to
avoid two indicators "visibly disagreeing." Revisited, at the user's direction: disagreement isn't
actually dishonest here — it's information. This whole cue exists for the *parent's* benefit (per
proposal.md's "Why"), not the child's; nothing about it is numeric, and a parent noticing "the time
trail is further along than the item trail" is not the same thing as the child seeing a score. Hiding
that behind a single blended figure traded real information for a false sense of tidiness. Overloading
the STONES themselves to also move with time is still rejected, for the original reason: a stone
lighting up while the child does nothing would read as "you lost a stone's worth of time," and would
contradict `NarrativeStage.tsx`'s existing, reviewed doc comment that stones encode "beats elapsed, never
correctness." So: stones stay exactly as they are (discrete, per-answer, unchanged meaning), and TWO
separate, continuous trails render behind them — one time-driven, one item-driven — each independently
honest about its own bound, both using the same low-opacity `--color-accent` tint so the stones
(solid, on top) stay visually dominant over either.

**Each channel is computed and rendered independently; there is no more single blended fraction.**
`journeyChannels()` (renamed from the earlier `journeyFraction()`) returns
`{ timeFraction, itemFraction }` rather than one `max()`-derived number. Each is clamped to
`[0, PRE_CLOSING_CAP]` independently while the bout is running, and both snap to exactly `1` together
when `complete` — preserving "the child never sees which bound fired" for both channels at once, the
same guarantee the single-trail version had, just applied twice instead of collapsed into one.

**The computation lives outside `BoutState`, in a new `session/session-clock.ts` factory, not a new
reducer field.** `createSessionClock()` provides an `elapedMs` function that gets passed into the engine's
existing injectable `SessionDeps.elapsedMs` — so the engine's own constructor-latched `startElapsedMs`
(`session.ts:87`) and the app's elapsed-time reading are the same reading by construction, not two
independent clocks that happen to agree. This is a factory, not a singleton — no `__resetForTests` needed,
following the same pattern as `input/pointer-gate.ts`'s `createPointerGate` (factory half, not its
module-singleton half).

**Injecting `performance.now()` where the engine previously defaulted to `Date.now()`.** A real, if minor,
behavior change: `Date.now()` is not monotonic (an NTP/wall-clock step could move the 90s bound, and would
now visibly yank the trail). Since the app has never injected this dependency before, doing so now is a
one-line, deliberate improvement — called out here explicitly rather than sliding in unmentioned.

**Rendering writes directly to two refs' `style.width`, one per channel, on a shared 1Hz interval, not
`useState`.** A per-second `setState` anywhere in the `BoutScreen` subtree would re-render `ProbePanel`
every second during probing and would produce `act()` warning noise in `BoutScreen.test.tsx`/
`App.test.tsx`, which already run real timers for several seconds per test. A width is animation output,
not state anything else derives from — writing it to each DOM node directly is both cheaper and quieter.
One interval drives both fills (no reason to run two independent timers for the same tick), and it
clears on unmount and once the bout completes, matching the existing timer-cleanup discipline in
`use-assessment-session.ts`.

**Capped at 97% (`PRE_CLOSING_CAP`) per channel while the bout is still running; both snap to exactly
100% only when `complete`.** Without a cap, a child who wanders off mid-probe (leaving the bout stuck in
`probing`, since the duration bound is only checked inside `nextProbe()`, which only runs after a
response) would come back to a completely full trail on a bout that still hasn't ended — a visible
broken promise, now for either channel independently. `complete` is derived from
`phase === "closing" | "done"`, not from `completionReason` — `completionReason` is deliberately never an
input to either channel's calculation, which is what makes "the child never sees which bound fired"
structurally true here too, matching `ClosingBeat.tsx`'s existing principle, rather than merely
convention.

**Reduced motion:** this app has no CSS classes (100% inline styles) and no way to express a media query
inline, so the component reads `window.matchMedia?.("(prefers-reduced-motion: reduce)").matches` once and
sets `transition: "none"` when true. At the real fill rate (~3px/s on a ~300px-wide path over 90s), the
un-transitioned version simply steps imperceptibly — nothing is lost.

## Risks / Trade-offs

- **[Risk]** Two filling bars is still visible motion, now doubled. Fills-never-drains, no color shift,
  low opacity, and a 4px height all lower the temperature, but a child who notices either one moving
  while hesitating could still learn "the picture moves when I'm slow." No amount of styling proves that
  away — only observing a real session (task 10.2 in `bootstrap-shizi-assessment`) settles it. →
  **Mitigation:** both trails are gated behind the single optional `timing` prop on `NarrativeStage`;
  removing them after a real session is a two-line revert, not a project.
- **[Risk]** Pressure can arrive through the adult, not the pixels — a parent narrating "hurry, we're
  almost done" while watching either bar reintroduces exactly the pressure the design removes from the
  screen. → **Mitigation:** none in code; named here so it's a known, not a silently-missed, risk.
- **[Risk]** The pre-existing engine gap (an abandoned bout can run past `maxDurationMs` without closing,
  since the bound is only checked inside `nextProbe()`) becomes newly *visible* once there's a progress
  indicator to notice being "stuck." → **Mitigation:** the 97% cap hides the visible symptom on both
  channels; it does not fix the underlying engine behavior, which is out of scope for this change (see
  Non-Goals).
- **[Trade-off]** The item-fraction trail and the existing stone path both derive from the same
  `beatIndex` — they represent closely related information at different granularities (0-6 discrete vs.
  0-`maxItems` continuous), which could read as redundant. Kept anyway: the continuous item trail is
  specifically what fixes the stones' saturation-at-6 problem, and the stones are deliberately left alone
  so their existing "beats elapsed" meaning doesn't change. Worth naming rather than glossing over.
- **[Trade-off]** Each channel still advances in a discrete jump on every answer (since `beatIndex` only
  changes on `RESPONDED`, not continuously) — removing the `max()` blend doesn't eliminate that, it just
  makes it more legible: the item trail's jump is now attributable to a clear, single cause (an answer
  was recorded) rather than to a `max()` crossover between two channels that could look like it came from
  nowhere.
