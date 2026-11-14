#!/usr/bin/env python3

import glob, os, json

dir = os.path.join(os.path.dirname(__file__), "..", "data")
for path in glob.glob(os.path.join(data_dir, "*_sun.json")) + glob.glob(os.path.join(data_dir, "*_earth.json")):
    with open(path) as f:
        content = f.read()
    base = os.path.splitext(path)[0]
    with open(base + ".js", "w") as f:
        f.write('window.__LSP_DATA=window.__LSP_DATA||{};')
        f.write(f'window.__LSP_DATA["{os.path.basename(base)}"]={content};\n')
    os.remove(path)
    print("converted", os.path.basename(base) + ".js")
# sites.json no longer needed (site list embedded in app.js)
sp = os.path.join(data_dir, "sites.json")
if os.path.exists(sp):
    os.remove(sp)
    print("removed sites.json (embedded in app.js)")

"""Converts data/*.json ephemeris files to data/*.js files so the app
works when opened directly from the filesystem or html clicked(file:// blocks fetch)."""