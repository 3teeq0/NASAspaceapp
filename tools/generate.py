#!/usr/bin/env python3
"""Generate Sun/Earth hourly azimuth+elevation data for lunar landing sites
using the JPL Horizons API (observer = geodetic site on the Moon, body 301).

Output: one JSON per site/body in data/:  {"t0": <unix sec>, "step": 3600,
"az": [...], "el": [...]}  with az rounded to 0.01 deg and el to 0.001 deg.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

BASE = "https://ssd.jpl.nasa.gov/api/horizons.api"
START, STOP = "2025-01-01", "2029-01-01"
STEP = "1h"

SITES = [
    # id, name, group, lon (deg E), lat (deg), approx flag
    ("ap11",   "Apollo 11 - Mare Tranquillitatis",   "Apollo landing sites", 23.47,  0.67,  False),
    ("ap12",   "Apollo 12 - Oceanus Procellarum",    "Apollo landing sites", -23.42, -3.01, False),
    ("ap14",   "Apollo 14 - Fra Mauro",             "Apollo landing sites", -17.47, -3.64, False),
    ("ap15",   "Apollo 15 - Hadley-Apennine",       "Apollo landing sites", 3.63,   26.13, False),
    ("ap16",   "Apollo 16 - Descartes Highlands",   "Apollo landing sites", 15.50,  -8.97, False),
    ("ap17",   "Apollo 17 - Taurus-Littrow",        "Apollo landing sites", 30.77,  20.19, False),
    ("ce3",    "Chang'e 3 - Mare Imbrium",          "Robotic landings",     -19.35, 44.12, False),
    ("ce4",    "Chang'e 4 - Von Karman (far side)", "Robotic landings",     177.99, -45.46, False),
    ("ce5",    "Chang'e 5 - Oceanus Procellarum",   "Robotic landings",     51.92,  43.06, False),
    ("slim",   "SLIM - Shioli crater",              "Robotic landings",     25.32,  -13.16, False),
    ("ch3",    "Chandrayaan-3 - Shiv Shakti Point", "Robotic landings",     -32.35, -69.37, False),
    ("bg1",    "Blue Ghost 1 - Mare Crisium",       "Robotic landings",     59.5,   18.1,  True),
    ("im1",    "IM-1 Odysseus - Malapert A",        "Robotic landings",     1.4,    -80.1, True),
    ("l25",    "Luna 25 target - Boguslawsky",      "Robotic landings",     43.2,   -69.8, True),
    ("mm",     "Mons Mouton (VIPER/IM-2 region)",   "South pole targets",   30.91,  -85.45, True),
    ("shack",  "Shackleton crater rim (Artemis III candidate)", "South pole targets", 129.4, -89.55, True),
    ("mmassif","Malapert Massif",                   "South pole targets",   -0.5,   -86.0, True),
    ("noble",  "Nobile Rim",                        "South pole targets",   31.1,   -85.6, True),
    ("cabeus", "Cabeus crater",                     "South pole targets",   -33.3,  -84.9, True),
    ("peary",  "Peary crater rim (north pole)",     "North pole target",    33.0,   88.6,  True),
]

def horizons(target, lon, lat):
    params = {
        "format": "text", "COMMAND": f"'{target}'", "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},0'",
        "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'",
        "STEP_SIZE": f"'{STEP}'", "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'", "CSV_FORMAT": "'YES'", "TIME_DIGITS": "'MINUTES'",
    }
    url = BASE + "?" + urllib.parse.urlencode(params).replace("+", "%20").replace("%27", "'")
    
    url = BASE + "?" + "&".join(f"{k}={v.replace(' ', '%20')}" for k, v in params.items())
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                text = r.read().decode("utf-8", "replace")
            m = re.search(r"\$\$SOE\n(.*?)\$\$EOE", text, re.S)
            if not m:
                raise ValueError("no SOE/EOE table")
            rows = []
            for line in m.group(1).strip().splitlines():
                # "2025-Jan-01 00:00, ,i,  91.541396,   -48.718927,"
                f = [c.strip() for c in line.split(",")]
                date_s, az, el = f[0], f[3], f[4]
                dt = time.strptime(date_s, "%Y-%b-%d %H:%M")
                import calendar
                t = calendar.timegm(dt)
                rows.append((t, float(az), float(el)))
            return rows
        except Exception as e:
            sys.stderr.write(f"retry {attempt} target={target} lon={lon}: {e}\n")
            time.sleep(5)
    raise SystemExit(f"failed for {target} at {lon},{lat}")

def main():
    outdir = os.path.join(os.path.dirname(__file__), "..", "data")
    os.makedirs(outdir, exist_ok=True)
    for sid, name, group, lon, lat, approx in SITES:
        for body, tname in (("sun", "10"), ("earth", "399")):
            path = os.path.join(outdir, f"{sid}_{body}.js")
            if os.path.exists(path):
                print(f"skip {path}")
                continue
            rows = horizons(tname, lon, lat)
            data = {
                "t0": rows[0][0], "step": 3600,
                "az": [round(r[1], 2) for r in rows],
                "el": [round(r[2], 3) for r in rows],
            }
            # written as a JS file so the webapp works from directly clicking the html file
            with open(path, "w") as f:
                f.write('window.__LSP_DATA=window.__LSP_DATA||{};')
                f.write(f'window.__LSP_DATA["{sid}_{body}"]=')
                json.dump(data, f, separators=(",", ":"))
                f.write(";\n")
            print(f"wrote {path}: {len(rows)} rows")
    print("done — site list & cache bounds are embedded in app.js")

if __name__ == "__main__":
    main()
