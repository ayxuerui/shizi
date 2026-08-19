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
  4. **Directly on point, verified directly (not just paraphrased) in
     Section 8:** OFL 1.1's own terms already permit this without a
     special carve-out — the reserved-name restriction (condition 2
     above) only applies to a *renamed* derivative with modified glyph
     designs; subsetting (removing glyphs, not altering the retained
     ones) isn't that. The upstream repo's README additionally points
     implementers at a recommended webfont-conversion package
     ([GitHub Issue #24](https://github.com/lxgw/LxgwWenKai/issues/24)) —
     useful practical guidance, not itself a distinct license grant.
  - **Action for Section 3/8 — DONE:** `apps/assessment/scripts/build-font-subset.ts`
    subsets the real LXGW WenKai (Regular, release v1.522 — the exact
    source this verification names, not the separate "Lite" repo the P0
    spike used for convenience) to this project's candidate pool +
    identity set + UI copy + ASCII/punctuation (305 characters, 60KB
    output). `OFL.txt` and a `subset-manifest.json` change-note (mirroring
    Make Me a Hanzi's `CHANGES.md` precedent) ship alongside it in
    `apps/assessment/public/fonts/`.

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

## HSK 3.0 character list — pool curation source

Introduced during Section 3 (task 3.1) implementation, not part of the
original P0 spike gate — recorded here per the `character-data` spec's own
"Data provenance and licensing" requirement before use, same discipline as
the datasets above.

- **Source:** https://github.com/elkmovie/hsk30 (`charlist.txt`) — text
  extracted and OCR'd from the official PRC Ministry of Education HSK 3.0
  standard PDF.
- **License:** MIT, confirmed directly (`LICENSE` in that repo). Copyright
  (c) 2021 Pleco Inc.
- **Verdict: GO.** MIT is permissive — no conditions beyond the standard
  MIT notice requirement if redistributing the file verbatim, which we're
  not doing (we use it as a curation input, not a redistributed artifact).
- **What we used it for:** Level 1's 300 characters, individually reviewed
  by hand (not machine-filtered) to select ~200 concrete/age-appropriate
  candidates for the pool, per `packages/character-data/src/data/pool-membership.ts`.
  We do not use, ship, or redistribute `charlist.txt` itself — only the
  resulting curated character selection.

## Summary

| Dataset | License | Verdict | Real conditions? |
|---|---|---|---|
| Make Me a Hanzi (`graphics.txt`) | Arphic Public License | GO | Yes — retain license file, note modifications, keep changes publicly available |
| LXGW WenKai | SIL OFL 1.1 | GO | Minor — include `OFL.txt`, don't rename. **Integrated in Section 8** — see `apps/assessment/public/fonts/`. |
| CC-CEDICT | CC BY-SA 3.0 | GO | Yes — attribution, share-alike, note changes. **Not yet integrated** — no glosses/pinyin used anywhere as of Section 3. |
| HSK 3.0 charlist | MIT | GO | None beyond standard MIT notice; not redistributed, used as a curation input only |

All four clear the gate. Make Me a Hanzi's Arphic-license actions are
fulfilled as of Section 3 (`packages/character-data/src/data/ARPHICPL.TXT`
+ `CHANGES.md`), and LXGW WenKai's are now fulfilled as of Section 8
(`apps/assessment/public/fonts/`). CC-CEDICT's action remains open until
glosses are first actually used — tracked as an explicit task, not left
implicit.
