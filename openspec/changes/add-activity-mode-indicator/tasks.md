## 1. Shared indicator component

- [ ] 1.1 Add `COPY.activityMode` to `apps/assessment/src/copy.ts`: bilingual labels for the three modules (`learn: { en: "LEARN", zh: "学" }`, `assess: { en: "ASSESS", zh: "测" }`, `review: { en: "REVIEW", zh: "复习" }`) and modalities (`listen: { en: "LISTEN", zh: "听" }`, `trace: { en: "TRACE", zh: "描" }`, `hearTap: { en: "HEAR-TAP", zh: "听选" }`) — automatically picked up by `collectCopyCharacters()`
- [ ] 1.2 Create `apps/assessment/src/closing/ActivityModeIndicator.tsx` (or `components/`): a fixed-position, muted, top-corner chip rendering `学 LEARN · 听 LISTEN`-style text from `module`/`activity` props; purely graphical text — no digits, no animation, no urgency styling; visually smaller and quieter than child-facing content
- [ ] 1.3 Rebuild the font subset (`npm run build:font`) for the new glyphs (学/描/听选/测/复/习) and confirm `check-precache.mjs` still passes

## 2. Render sites

- [ ] 2.1 `BoutScreen.tsx`: render `<ActivityModeIndicator module="assess" activity="hear-tap" />` for the whole component lifetime (probing through closing beat)
- [ ] 2.2 `ExposureScreen.tsx`: render the indicator with `module="learn"` and the delivered item's arm (`listen`/`trace`) as the activity, tracking the current item
- [ ] 2.3 `MemoryScreen.tsx`: render the indicator with `module="review"`, `activity="hear-tap"`

## 3. Tests

- [ ] 3.1 `BoutScreen.test.tsx`: the indicator is present from the first rendered probe through the closing beat; its text contains no digit or `%` (extends the existing `assertNoScoreLikeText` sweep rather than bypassing it)
- [ ] 3.2 `ExposureScreen.test.tsx`: the indicator names `学 LEARN` and flips `听 LISTEN`/`描 TRACE` to match the delivered arm; no score-like text
- [ ] 3.3 `MemoryScreen.test.tsx`: the indicator names `复习 REVIEW · 听选 HEAR-TAP`; no score-like text
- [ ] 3.4 Component test for `ActivityModeIndicator`: renders both languages; renders no digits for any known module/activity combination

## 4. Spec coordination (planning-artifact edits only)

- [ ] 4.1 Add one ADDED requirement to `openspec/changes/add-tracing-modality-arm/specs/exposure/spec.md`: the exposure screen persistently identifies the learn module and the assigned activity (adaptivity's arm) with the same purely-graphical bilingual indicator (mirroring this change's assessment delta, scoped to exposure's own guarantees)
- [ ] 4.2 Add the matching ADDED requirement to `openspec/changes/add-layered-learning-architecture/specs/memory-review/spec.md` for the review screen
- [ ] 4.3 Verify exactly one definition of the indicator requirement per capability across `openspec/` — this change owns `assessment`'s wording; the other two deltas reference the same behavior without redefining styling or placement

## 5. Verification

- [ ] 5.1 `npm test`, `npm run typecheck`, `npm run lint` pass workspace-wide with no pre-existing test modified beyond the closing-beat additions above
- [ ] 5.2 Ship to the dev stack per `AGENTS.md` and confirm in a real browser (chrome-devtools MCP, `shizi-dev.realxco.com`): the chip shows the right module/activity on each of the three screens, survives the learn → assess rotation, and never renders a digit
- [ ] 5.3 `openspec validate --all --strict`
