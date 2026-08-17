# Spike data provenance

`sample-characters.json` in this directory contains stroke path/median data
for 4 characters (人, 山, 木, 好), extracted from `graphics.txt` in
[skishore/makemeahanzi](https://github.com/skishore/makemeahanzi) on
2026-08-17, for the sole purpose of the P0 rendering spikes in
`openspec/changes/bootstrap-shizi-assessment/tasks.md` Section 2.

This is a modification (subset) of that data under the **Arphic Public
License** — see `ARPHICPL.TXT` in this directory (retained per license
Section 1) and this note (the required "how and when changed" notice per
license Section 2a: 4 entries extracted verbatim, no other modification).

This is throwaway spike data, not the production candidate pool. The real
~200-character dataset is built properly in Section 3 (`character-data`
package), where this same license applies and is tracked again in
`data/PROVENANCE.md` and task 3.8.
