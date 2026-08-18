# Tagging review — task 3.3

`tagging-review.csv` has a **draft** concreteness + pictographic tag for
all 209 characters (203 pool + 6 identity), generated from a consistent
rule (concrete = sense-perceivable: objects, beings, sensory adjectives,
physical actions; abstract = grammar, pronouns, modal/mental verbs, time/
quantity concepts; pictographic = traditional origin is recognizably a
picture of its referent).

**This is a draft for review, not authoritative** — per the
`character-data` spec, only a human-supplied tag is authoritative. The
point of generating a draft is to turn this from "originate 209 judgments
from scratch" into "review/correct 209 suggestions," matching design.md's
"~20 minutes" estimate for this pass.

**Also needs your input, separately:** 4 characters have no frequency
rank yet (悟, 空, 姥, and 木 — 木 is in Phase A for pictographic/teaching
reasons but isn't in the HSK 3.0 Level 1 source list at all). If you have
a rough sense of how common/important these should be treated as, that
would help; otherwise they'll stay excluded from Phase B scoring
(though 木 is fine regardless, since Phase A doesn't need scoring) until
that's supplied.

## What to do

1. Open `tagging-review.csv` in a spreadsheet app.
2. Skim the `concreteness_DRAFT` and `pictographic_DRAFT` columns, fix
   anything that looks wrong. Given a heritage 4-year-old's actual
   vocabulary, some of my calls may not match reality — you know her
   better than any general rule can.
3. Identity-set rows (marked in `notes`) don't need tags — they're used as
   logos, not taught via the curriculum.
4. Send the corrected file back (or just tell me which rows to change) and
   I'll fold it into `packages/character-data`, which will flip those
   characters from excluded to usable (see `exclusion.ts`).
