# Spike 2.7 — CJK HTML→PDF via headless Chromium

**Result: PASS.** Verified visually (rendered `output.pdf` and inspected it
directly) on 2026-08-17.

- All test characters render correctly — no tofu/□ boxes, including the
  identity-set characters (薛亦霖, 小蓝莓) and punctuation (，。).
- The 楷体 (Kai script) calligraphic stroke style is clearly visible at the
  48pt sample size — this is not falling back to a generic serif/sans.
- Page lays out as an actual printable A4 page (title, body text, footer
  note), not just a screen mockup.
- Output PDF is ~60KB for one page — Chromium appears to subset the
  embedded font to only the glyphs actually used, which is a good sign for
  the eventual print pipeline's file size.

This de-risks the technical approach named in design.md: "the browser
serves double duty as the future PDF typesetter." No blockers found for
the `printed-reader` change.

## Reproducing

```
cd spikes/pdf-render
npm install          # installs playwright (not a project dependency —
                      # this whole spikes/ directory is throwaway)
node render.mjs       # writes output.pdf
```

Note: `render.mjs` points Playwright at the system-installed Chromium
(`/usr/bin/chromium-browser`) rather than Playwright's own bundled browser,
because this sandbox couldn't fetch Playwright's browser + full dependency
set (no apt access). The real print pipeline (Section 9+) should pin an
explicit Chromium version in CI rather than rely on whatever's on the host.

## Font provenance for this spike

`LXGWWenKaiLite-Regular.ttf` and `OFL.txt` are downloaded directly from
[lxgw/LxgwWenKai-Lite](https://github.com/lxgw/LxgwWenKai-Lite)'s latest
release (v1.522), used unmodified. SIL OFL 1.1 — the Lite repo's own
`OFL.txt` explicitly grants an additional permission for exactly this use
(subsetting/format-converting for web-font delivery), see the "[ADDITIONAL
PERMISSION]" clause at the top of that file. This is a throwaway copy for
the spike; the real font subset for the app is built properly in Sections
3/8 per `data/PROVENANCE.md`.
