# Lunar Landing Site Planner

A lightweight web tool for rapidly evaluating lunar landing sites: pick a site and a date
window and see where the **Sun** and **Earth** sit relative to the local horizon — solar
elevation (power generation) and Earth visibility (direct-to-Earth communication windows).

Built for the NASA Space Apps Challenge — "Rapid Lunar Site Evaluation" / the CLPS
mission-planning gap between raw ephemeris tools (QuickMap, Moon Trek, JPL Horizons) and
fast, comparable scenario assessment.

## Features

- **20 curated sites**: Apollo 11–17, Chang'e 3/4/5, SLIM, Chandrayaan-3, Blue Ghost 1,
  IM-1 Odysseus, Luna 25 target, and south/north pole CLPS & Artemis targets
  (Mons Mouton, Shackleton rim, Malapert Massif, Nobile Rim, Cabeus, Peary).
  Custom latitude/longitude also supported.
- **Date flexibility**: any start time (UTC) and window from 1 day to 1 year.
- **Sun & Earth position visualization**:
  - elevation-vs-time chart (Sun and Earth curves against the horizon),
  - sky-dome polar plot (azimuth/elevation tracks as seen from the site),
  - operational-windows timeline (sunlit / Earth-up / both),
  - time scrubber + **play animation** of Sun/Earth motion over the window.
- **Key metrics**: current Sun/Earth elevation & azimuth, time to next sunset/Earthset
  (or sunrise/Earthrise), peak Sun elevation, % of window sunlit, longest continuous
  daylight, Earth elevation range, % Earth-visible, solar incidence on a level panel,
  and the full-operations overlap (sunlit AND Earth-visible).
- **Scenario comparison**: save site+date combinations, compare them in a metrics table
  and on an overlaid elevation chart.
- **Link-outs**: each scenario deep-links to LROC QuickMap and Moon Trek for terrain
  context, and to the raw JPL Horizons ephemeris for verification.

## How it works

On open, a short Moon animation splash plays (15 s max, click to skip), then the
site-selection screen appears: preset sites on the right of the dropdown, custom
coordinates as an option, plus date/window controls. Loading a scenario reveals the
full analysis window 
— and the controls stay on top, so you can change site or
coordinates without reloading the page.

Ephemerides come from the
[JPL Horizons system](https://ssd.jpl.nasa.gov/horizons/): the observer is a topocentric
geodetic site on the Moon (body 301, mean-Earth/polar frame), and Horizons returns
apparent azimuth/elevation of the Sun and Earth (DE441 ephemerides, light-time and
aberration corrected, airless — no refraction). Earth libration is therefore included.

Two data paths, chosen automatically:

1. **Precomputed cache (fast, offline)** — hourly Sun/Earth az/el for all curated sites,
   2025-01-01 → 2029-01-01, generated once with `tools/generate.py` (which calls the
   Horizons REST API) and stored as script-tag JS files in `data/` (~470 KB per site,
   lazy-loaded). Works even when the folder is opened directly via file://.
2. **Live fetch (custom coordinates or dates outside 2025–2029)** — the browser queries
   the Horizons REST API directly. JPL's endpoint does not send CORS headers, so the
   request falls back to public CORS relays (Jina reader, allOrigins, corsproxy).
   This path is experimental and needs internet access.

The horizon is the geometric horizon of the lunar reference ellipsoid. Local terrain is
not modelled (see limitations).

## Run locally

It is a static site — no build, no dependencies, no server-side code:

```
cd lunar-planner
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

## Regenerate the dataset

```
python3 tools/generate.py     # ~2 s per site/body; writes data/*.json
```

## Limitations (deliberate, v1)

- **Flat-terrain horizon**: crater rims and mountains can block the Sun/Earth below the
  geometric horizon — critical at rough south-pole sites. Use the QuickMap/Moon Trek
  link-outs to judge terrain; roughly, below ~1.5° elevation terrain effects dominate.
- No thermal analysis, solar array geometry, relay-satellite coverage, or Earth-based
  ground-station scheduling — this tool answers the first-order "power + comms" question.
- Live-fetch relays are third-party and rate-limited; the curated cache always works.

## Files

- `index.html`, `style.css`, `app.js` — the app (vanilla JS, hand-rolled canvas charts).
- `assets/moon.mp4` — splash animation taken from the canadian moon exploration site :"https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/"
- `data/{site}_{sun|earth}.js` — precomputed ephemerides (script-tag files).
- `tools/generate.py` — Horizons dataset generator. `tools/to_js.py` converts old JSON files.
