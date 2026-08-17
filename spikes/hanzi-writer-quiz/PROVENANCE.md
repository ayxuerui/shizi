# Data provenance — this spike only

`data.json` contains stroke path/median data for 人, 山, 木, 好, fetched from
[hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) (npm
`hanzi-writer-data`, v2.0.1 at time of fetch), which is itself derived from
[Make Me a Hanzi](https://github.com/skishore/makemeahanzi)'s `graphics.txt`
"with some slight tweaks" per that repo's README.

**License:** same lineage as `spikes/shared/` — Arphic Public License (see
`spikes/shared/ARPHICPL.TXT`), since hanzi-writer-data explicitly carries
that license forward for the character data (confirmed in hanzi-writer's own
README: "You can redistribute and/or modify this data under the terms of
the Arphic Public License"). The `hanzi-writer` library code itself (loaded
via CDN in `index.html`) is MIT licensed, separately.

This is throwaway spike data for 4 characters, same as `spikes/shared/`.
If `hanzi-writer` is adopted for the real app (see design.md), the real
integration should use the `hanzi-writer-data` npm package directly rather
than a hand-copied JSON file, and Section 3.8's license-compliance task
covers bundling the required notices properly.
