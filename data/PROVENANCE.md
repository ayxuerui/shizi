# Data provenance

Verification log for external datasets/fonts used by this project, per
`openspec/changes/bootstrap-shizi-assessment/tasks.md` tasks 2.1-2.3. No
dataset listed here as **GO** may be used until this file records that
verification; per design.md, this is a go/no-go gate before Section 3
(character data core) begins.

## Make Me a Hanzi — stroke-path data

- **Source:** https://github.com/skishore/makemeahanzi
- **What we need:** `graphics.txt` / `svgs.tar.gz` — ordered SVG stroke path
  data and stroke medians. (We do **not** use `dictionary.txt` — glosses
  come from CC-CEDICT instead, see below.)
- **License:** the repo ships two different licenses depending on file.
  Confirmed directly from `COPYING` in the repo:
  - `dictionary.txt` → GNU LGPL v3+ (not used by this project)
  - `graphics.txt` / `svgs.tar.gz` (**what we use**) → **Arphic Public
    License** (derived from the Arphic PL KaitiM GB / Arphic PL UKai
    fonts), full text at `APL/english/ARPHICPL.TXT` in that repo.
- **Verdict: GO**, with real conditions (this is a copyleft-style license,
  not a permissive one):
  1. Must retain the license file (`ARPHICPL.TXT`) unaltered alongside any
     copy or modification we ship.
  2. If we modify the data (we will — subsetting to our ~200-character
     candidate pool is a modification under this license), we must note
     *how and when* it was changed.
  3. Modifications must be made "Freely Available" to third parties under
     the same terms — i.e. we cannot keep a private, silently-modified
     fork. **This project satisfies that by keeping the repo (including
     the subsetted stroke data and this notice) publicly accessible on
     GitHub.** If this repo is ever made private, this condition would need
     re-examining before shipping a build.
  - **Action for Section 3 (task 3.4):** when the subsetted stroke-path
    dataset is generated, bundle `ARPHICPL.TXT` and a short change-note
    (what was extracted/subsetted, when) alongside it in `data/`.

## LXGW WenKai (霞鹜文楷) — font

- **Source:** https://github.com/lxgw/LxgwWenKai
- **License:** SIL Open Font License 1.1 (OFL-1.1), confirmed directly on
  the repo (`OFL.txt`).
- **Verdict: GO.** Free for personal and commercial use, no fee, no
  notification required, can be embedded in an app/site, can be modified
  and subset. Conditions that apply to us:
  1. Cannot sell the font file on its own (not applicable — we're not
     distributing the font as a standalone product).
  2. Cannot use the reserved names ("霞鹜", "落霞孤鹜", "LXGW") on a
     *renamed derivative* without permission — not applicable, we are
     using it as-is/subset, not renaming or re-releasing it as a distinct
     font.
  3. Must include `OFL.txt` when redistributing the font file.
  4. **Directly on point:** the project's own README explicitly carves out
     web-font subsetting/format-conversion (exactly our case — a subset
     for the app and the future print pipeline) as a case where the
     reserved-name restriction doesn't block normal use.
  - **Action for Section 3/8:** include `OFL.txt` alongside the subset font
    file shipped in the app bundle.

## CC-CEDICT — glosses

- **Source:** https://cc-cedict.org (download via MDBG)
- **License:** Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0),
  confirmed directly on the CC-CEDICT wiki.
- **Verdict: GO**, with standard BY-SA conditions:
  1. **Attribution** required in any redistribution.
  2. **Share-alike:** any derivative dataset we publish (e.g. a candidate
     pool with glosses attached, committed to this repo) must itself carry
     a BY-SA 3.0 notice.
  3. Must indicate if changes were made to the original data.
  - **Action for Section 3:** add a `data/ATTRIBUTIONS.md` (or equivalent
    NOTICE) covering CC-CEDICT attribution + BY-SA terms before any
    CC-CEDICT-derived data is committed.

## Summary

| Dataset | License | Verdict | Real conditions? |
|---|---|---|---|
| Make Me a Hanzi (`graphics.txt`) | Arphic Public License | GO | Yes — retain license file, note modifications, keep changes publicly available |
| LXGW WenKai | SIL OFL 1.1 | GO | Minor — include `OFL.txt`, don't rename |
| CC-CEDICT | CC BY-SA 3.0 | GO | Yes — attribution, share-alike, note changes |

All three clear the gate. None are blockers for Section 3, provided the
"Action" items above are carried out when each dataset is actually
integrated (tracked as explicit tasks, not left implicit).
