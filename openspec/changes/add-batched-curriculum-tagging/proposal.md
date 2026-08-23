## Why

Two unfinished threads meet in the same place. Task 3.3's parent hand-tagging pass assumed
a one-shot spreadsheet review of 209 draft concreteness/pictographic tags; it never
happened, so every consumer still reads generated drafts flagged `tagSource: "draft"`. And
the curriculum introduces characters strictly one at a time, which gives the parent no
natural moment to look ahead at what is coming.

The parent is now learning alongside the child, which makes both solvable at once:
concreteness for a specific four-year-old is far easier to judge while watching her respond
to a character than from a spreadsheet row, and teaching in batches creates a recurring,
predictable moment — the start of each batch — where reviewing the next few characters is a
natural part of the routine rather than a separate chore.

## What Changes

- Characters are introduced in **batches** rather than one at a time. Batch size is
  configurable, defaulting to **5** — chosen to match the existing `recentWindowSize: 5`
  confusability window, so "no two confusable characters inside one batch" follows from the
  spacing constraint that already exists instead of needing a new rule. Phase A's 25
  characters become exactly 5 batches.
- Batches are **published**, not computed in the app. The curriculum is a slow loop
  ("deliberately NOT recomputed client-side" — `publish-config.ts:3-4`), so config publishing
  composes several upcoming batches ahead and the app consumes them. This generalizes the
  greedy provisional-state look-ahead that script already performs
  (`publish-config.ts:53-72`, currently a flat `nextTargets` list of 10) into batch shape,
  and makes the app the first real consumer of a Loop 1 field that until now was published
  for nobody (`published-config.ts:41-46`).
- A **parent review gate** runs before each batch starts. It presents the batch's
  characters with their current draft tags pre-filled, so the interaction is confirm-or-
  correct rather than originate-from-scratch, and the batch does not begin until the parent
  closes the review.
- The parent **advances the batch** from that same review screen, which also reports the
  current batch's mastery progress. No automatic mastery threshold — one character that
  never reaches two consecutive fast-correct responses must not be able to stall learning
  indefinitely.
- Parent tag corrections are captured as **append-only `CharacterTag` records** (natural
  key `(character, taggedAt)`, latest-wins on read), synced through the existing offline
  outbox, exported to the durable repo-side record, and folded back into
  `data/tagging-review.csv`'s reviewed columns — which flips those characters from
  `tagSource: "draft"` to `"reviewed"` with no change to `build-tags.mjs`.
- The canonical export set grows a fourth stream (`data/events/tags.jsonl`), which the
  backup automation must both commit and tolerate.

Not breaking: nothing currently gates on `tagSource`, and every character already carries a
usable draft tag, so this raises data quality without changing which characters are
selectable today.

## Capabilities

### New Capabilities
- `parent-review`: the pre-batch parent review gate — what it presents, that a batch cannot
  begin until it is closed, that it captures tag corrections offline, that it reports batch
  mastery progress, and that it is the surface from which the parent advances to the next
  batch. Distinct from `adaptivity-instrumentation`'s existing one-tap session rating, which
  is an end-of-bout experiment signal rather than a parent workflow gate.

### Modified Capabilities
- `curriculum`: introduction becomes batch-shaped. Adds requirements for composing a batch
  of a configurable size (default 5) from the existing per-character selection logic, for
  the intra-batch confusability guarantee, for planning several batches ahead, and for the
  curriculum never advancing a batch on its own. The existing Phase A / scoring / spacing
  requirements keep their behavior and become the primitives a batch is composed from, so
  they are reused rather than modified.
- `character-data`: adds a requirement that human tag corrections are captured
  incrementally and append-only, with latest-wins resolution and a `draft` → `reviewed`
  transition. This finally delivers the mechanism the existing "Per-character attributes"
  requirement already demands ("reviewable and correctable by a human rather than derived
  solely from an opaque automated process") and properly satisfies its "Human-supplied
  concreteness tag" scenario.
- `deployment`: the canonical export set is no longer just event and rating data. The
  backup automation's clean-clone guard currently excludes exactly three hardcoded paths
  (`backup-and-push.ts:68-70`), so an unlisted `tags.jsonl` would present as an
  uncommitted change outside the canonical set and make the nightly backup **refuse to run
  at all**. The requirement's intent is unchanged; which files count as canonical is what
  changes.

## Impact

**Curriculum** — `packages/curriculum`: new `composeBatch` (and a multi-batch plan built
from it), which absorbs the greedy simulate-as-known loop currently inlined in
`publish-config.ts:57-72` — moving it into a tested library function rather than leaving
curriculum logic in a deployment script. New `batchSize` and batch-lookahead knobs on
`CurriculumConfig`. `selectNextCharacter` stays the primitive each batch is composed from.

**Character data** — `packages/character-data`: new `CharacterTag` type,
`validateCharacterTag` (one validator, three call sites, mirroring
`validateSessionRating`), and a `latestTagPerCharacter` projection. New
`scripts/apply-tag-events.mjs` folding exported tags into
`data/tagging-review.csv`; `build-tags.mjs` unchanged — its per-row draft/reviewed logic
(`build-tags.mjs:84-93`) already handles partial review correctly.

**App** — `apps/assessment`: new parent review screen reached the same way diagnostics
already is (unlabeled corner long-press plus a hash route), reusing `TapTarget`,
`createLongPress`, and `diagnostics/theme.ts`. New `tags` IndexedDB store
(`DB_VERSION` 2 → 3), `enqueueTag`/`listPendingTags`/`markTagsSynced`, and a fourth block
in `flushQueue`. `published-config.ts` starts reading the published batch plan, keeping its
existing bundled-fallback-on-any-failure discipline. Which batch is current, and whether its
review is closed, is local state that must survive relaunch.

**Sync service** — `infra/sync-service`: `/tags` route, `handleTagsSync`, a
`character_tags` table with `UNIQUE (character, tagged_at)` and `INSERT OR IGNORE`, and a
`tags.jsonl` export from `pull-events.ts` inside the existing `SHIZI_ENV=dev`
canonical-record guard. `publish-config.ts` publishes a batch plan and folds reviewed tags
into the pool it publishes.

**Backup** — `infra/sync-service/scripts/backup-and-push.ts`: `tags.jsonl` added to both
the pathspec exclusion list and the `git add` set. Without this the nightly job breaks.

**Docs** — `data/TAGGING-REVIEW.md` rewritten from a batch-spreadsheet workflow to the
in-session one; `bootstrap-shizi-assessment/tasks.md` task 3.3 re-pointed at this change.

**Out of scope** — frequency ranks for 悟/空/姥/木 (still the actual reason those four are
excluded from scoring); making anything gate on `tagSource`; and
`pickDistractors` not filtering `isUsable` (`distractors.ts:38`), a pre-existing gap against
`character-data`'s "Missing attribute blocks use" scenario that deserves its own change.
