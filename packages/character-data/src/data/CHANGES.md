# Change note — stroke-path data (Arphic Public License compliance)

Required by `ARPHICPL.TXT` (this directory) Section 2(a): "You must insert
a prominent notice in each modified file stating how and when you changed
that file." This is that notice.

**2026-08-17:** `stroke-data.ts` is a subset of `graphics.txt` from
[skishore/makemeahanzi](https://github.com/skishore/makemeahanzi),
covering exactly the 209 characters in this project's candidate pool +
identity set (see `pool-membership.ts`). Modifications made:

1. **Extracted** 209 of ~9500 character entries; all other characters
   removed.
2. **Format-converted** from newline-delimited JSON (`graphics.txt`) to a
   TypeScript module with a `export default {...}` wrapper, to avoid a
   `composite` TypeScript project limitation with JSON module imports
   (TS6307). The underlying `strokes` and `medians` values are otherwise
   unchanged from the source.

No other modification was made — stroke path data, medians, and
per-character structure are verbatim from the source for the 209 included
characters.

Per Section 2(b), this modification is kept "Freely Available" by being
part of this project's public GitHub repository (https://github.com/ayxuerui/shizi),
alongside this license file and this notice — see also `data/PROVENANCE.md`
at the repo root.
