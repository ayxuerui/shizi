# P0 spikes

Throwaway diagnostic pages for `openspec/changes/bootstrap-shizi-assessment/tasks.md`
Section 2 (go/no-go gates before Section 3 starts). Not production code —
plain HTML/JS, no build step, meant to be deleted once their questions are
answered.

## Running them on the iPad

### Option A: https://shizi.realxco.com (live now, works anywhere)

Confirmed working — verified `200` on every path below. No need to be on
the same WiFi network; this works over cellular too, via the cloudflared
tunnel already wired up in `docker-compose.yml`.

- https://shizi.realxco.com/ — landing page with tappable links
- https://shizi.realxco.com/stroke-animation/ — spike 2.4
- https://shizi.realxco.com/hanzi-writer-quiz/ — spike 2.5, revised (see below)
- https://shizi.realxco.com/pencil-input/ — spike 2.5, superseded, kept for reference
- https://shizi.realxco.com/ios-constraints/ — spike 2.6

This is a bare public hostname with no Access policy — fine for now since
there's nothing sensitive in these pages, but worth tearing down
(`docker compose down`, then remove the Public Hostname entry in the
Zero Trust dashboard) once the P0 spikes are done rather than leaving it
open indefinitely.

### Option B: LAN only (`docker compose up -d`, port 8080)

Same container also publishes port 8080 on this machine's LAN IP, if you'd
rather not go over the public hostname:

```
http://<this-machine's-ip>:8080/
```

Find the IP via `hostname -I`. iPad must be on the same WiFi for this one.

### Option C: npx serve (no Docker needed)

```
npx serve spikes
```

Prints its own `Network:` URL — same paths, different port.

Each page has its own on-page checklist of what to try. Spike 2.7 (PDF
rendering) doesn't need the iPad at all — already run and verified, see
`pdf-render/README.md`.

## What to report back, per spike

- **2.4 stroke-animation:** smoothness, stroke style/thickness, timing feel,
  any input lag.
- **2.5 hanzi-writer-quiz (current):** try Animate first, then Quiz — trace
  with Apple Pencil, palm resting on screen, both fast back-to-back and with
  pauses between strokes (the exact conditions that broke the hand-rolled
  version). Does every stroke register? Any stray marks from palm contact?
  This is testing the actual library `design.md` now specifies, not
  throwaway canvas code — see "Decision: adopt hanzi-writer" there.
- **2.5 pencil-input (superseded):** the hand-rolled canvas version hit
  three real, fixed bugs (hover-drawing, buttons-timing race,
  resize-clearing-canvas) and one still-unresolved ("dot doesn't show" on
  rapid touches). Kept for reference; not being debugged further, since
  we're not shipping this code regardless of the outcome.
- **2.6 ios-constraints:** confirm the autoplay block, confirm the tap-unlock
  tone plays, and — over the following days, not right now — whether the
  "first visit" timestamp resets on its own (storage eviction). Also whether
  `display-mode` differs between a normal Safari tab and after "Add to Home
  Screen".
- **2.7 pdf-render:** see `pdf-render/README.md` — I run this one myself and
  will show you the output to sanity-check visually.

## Data provenance

`shared/sample-characters.json` is a small, explicitly-licensed subset of
Make Me a Hanzi data — see `shared/PROVENANCE.md`.
