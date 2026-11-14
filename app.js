/* Lunar Landing Site Planner
 * Sun/Earth azimuth+elevation for lunar landing sites, from JPL Horizons.
 * Vanilla JS, no dependencies. Cached hourly data 2025-2029 for curated sites;
 * live Horizons fetch (via CORS relay) for custom coordinates / other dates.
 */
"use strict";

/* ---------------- helpers ---------------- */

const $ = (id) => document.getElementById(id);
const SUN_C = "#f2c14e", EARTH_C = "#5aa9e6";
const PALETTE = ["#f2c14e", "#5aa9e6", "#e0774f", "#8bd450", "#c792ea", "#4ecdc4"];
const MON = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
const pad = (n) => String(n).padStart(2, "0");

function fmtUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
function fmtDay(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + h + "h " + m + "m";
}
function lerpAz(a, b, f) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * f;
}
/* interpolate a series {t0,step,az[],el[]} at time t (unix sec) */
function interp(s, t) {
  const n = s.az.length;
  const i = (t - s.t0) / s.step;
  if (i < 0 || i > n - 1) return null;
  if (i >= n - 1) return { az: s.az[n-1], el: s.el[n-1] };
  const i0 = Math.floor(i), f = i - i0;
  return {
    az: lerpAz(s.az[i0], s.az[i0+1], f),
    el: s.el[i0] + (s.el[i0+1] - s.el[i0]) * f,
  };
}
function crop(s, t0s, t1s) {
  const i0 = Math.max(0, Math.floor((t0s - s.t0) / s.step));
  const i1 = Math.min(s.az.length - 1, Math.ceil((t1s - s.t0) / s.step));
  return { t0: s.t0 + i0 * s.step, step: s.step,
           az: s.az.slice(i0, i1 + 1), el: s.el.slice(i0, i1 + 1) };
}
/* zero-elevation crossings: [{t (sec), up}] */
function crossings(s) {
  const out = [];
  for (let i = 0; i < s.el.length - 1; i++) {
    const a = s.el[i], b = s.el[i+1];
    if ((a > 0) !== (b > 0)) {
      const f = a / (a - b);
      out.push({ t: s.t0 + (i + f) * s.step, up: b > 0 });
    }
  }
  return out;
}


/* Curated sites & cache bounds (embedded so the app works from html file too). */
const SITES = [
  { id: "ap11",    name: "Apollo 11 - Mare Tranquillitatis",     group: "Apollo landing sites", lon: 23.47,  lat: 0.67,  approx: false },
  { id: "ap12",    name: "Apollo 12 - Oceanus Procellarum",      group: "Apollo landing sites", lon: -23.42, lat: -3.01, approx: false },
  { id: "ap14",    name: "Apollo 14 - Fra Mauro",                group: "Apollo landing sites", lon: -17.47, lat: -3.64, approx: false },
  { id: "ap15",    name: "Apollo 15 - Hadley-Apennine",          group: "Apollo landing sites", lon: 3.63,   lat: 26.13, approx: false },
  { id: "ap16",    name: "Apollo 16 - Descartes Highlands",      group: "Apollo landing sites", lon: 15.50,  lat: -8.97, approx: false },
  { id: "ap17",    name: "Apollo 17 - Taurus-Littrow",           group: "Apollo landing sites", lon: 30.77,  lat: 20.19, approx: false },
  { id: "ce3",     name: "Chang'e 3 - Mare Imbrium",             group: "Robotic landings",     lon: -19.35, lat: 44.12, approx: false },
  { id: "ce4",     name: "Chang'e 4 - Von Karman (far side)",    group: "Robotic landings",     lon: 177.99, lat: -45.46, approx: false },
  { id: "ce5",     name: "Chang'e 5 - Oceanus Procellarum",      group: "Robotic landings",     lon: 51.92,  lat: 43.06, approx: false },
  { id: "slim",    name: "SLIM - Shioli crater",                 group: "Robotic landings",     lon: 25.32,  lat: -13.16, approx: false },
  { id: "ch3",     name: "Chandrayaan-3 - Shiv Shakti Point",    group: "Robotic landings",     lon: -32.35, lat: -69.37, approx: false },
  { id: "bg1",     name: "Blue Ghost 1 - Mare Crisium",          group: "Robotic landings",     lon: 59.5,   lat: 18.1,  approx: true },
  { id: "im1",     name: "IM-1 Odysseus - Malapert A",           group: "Robotic landings",     lon: 1.4,    lat: -80.1, approx: true },
  { id: "l25",     name: "Luna 25 target - Boguslawsky",         group: "Robotic landings",     lon: 43.2,   lat: -69.8, approx: true },
  { id: "mm",      name: "Mons Mouton (VIPER/IM-2 region)",      group: "South pole targets",   lon: 30.91,  lat: -85.45, approx: true },
  { id: "shack",   name: "Shackleton crater rim (Artemis III candidate)", group: "South pole targets", lon: 129.4, lat: -89.55, approx: true },
  { id: "mmassif", name: "Malapert Massif",                       group: "South pole targets",   lon: -0.5,   lat: -86.0, approx: true },
  { id: "noble",   name: "Nobile Rim",                           group: "South pole targets",   lon: 31.1,   lat: -85.6, approx: true },
  { id: "cabeus",  name: "Cabeus crater",                        group: "South pole targets",   lon: -33.3,  lat: -84.9, approx: true },
  { id: "peary",   name: "Peary crater rim (north pole)",        group: "North pole target",    lon: 33.0,   lat: 88.6,  approx: true },
];
const CACHE_START = Date.parse("2025-01-01T00:00:00Z") / 1000;
const CACHE_END = Date.parse("2029-01-01T00:00:00Z") / 1000;

const seriesCache = {};        // site.id -> {sun, earth}
let current = null;            // active scenario
let compares = [];             // [{site, start, dur}]
let scrubT = 0;                // current scrub time (ms)
let playing = false, rafId = null, playT0 = 0, scrubAtPlay = 0;



function status(msg, err) {
  const el = $("status");
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

/* Load an ephemeris file as a <script> tag (works from file:// and http(s)). */
function loadSeriesFile(key) {
  if (!window.__LSP_DATA) window.__LSP_DATA = {};
  if (window.__LSP_DATA[key]) return Promise.resolve(window.__LSP_DATA[key]);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "data/" + key + ".js";
    s.onload = () => window.__LSP_DATA[key] ? resolve(window.__LSP_DATA[key])
                                            : reject(new Error("data file empty: " + key));
    s.onerror = () => reject(new Error("cannot load data/" + key + ".js"));
    document.head.appendChild(s);
  });
}

function populateSelect() {
  const sel = $("siteSelect");
  const groups = {};
  for (const s of SITES) (groups[s.group] = groups[s.group] || []).push(s);
  for (const g of Object.keys(groups)) {
    const og = document.createElement("optgroup");
    og.label = g;
    for (const s of groups[g]) {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.name + (s.approx ? " (approx.)" : "");
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  const oc = document.createElement("option");
  oc.textContent = "Custom coordinates…"; oc.value = "custom";
  sel.appendChild(oc);
  sel.value = "shack";
}

async function getSeries(site, startMs, endMs) {
  const t0s = startMs / 1000, t1s = endMs / 1000;
  const useCache = site.id !== "custom" && t0s >= CACHE_START && t1s <= CACHE_END;
  if (useCache) {
    if (!seriesCache[site.id]) {
      const [sun, earth] = await Promise.all([
        loadSeriesFile(site.id + "_sun"),
        loadSeriesFile(site.id + "_earth"),
      ]);
      seriesCache[site.id] = { sun, earth };
    }
    const c = seriesCache[site.id];
    return { sun: crop(c.sun, t0s, t1s), earth: crop(c.earth, t0s, t1s), source: "cache" };
  }
  const [sun, earth] = await Promise.all([
    liveFetch(10, site.lon, site.lat, startMs, endMs),
    liveFetch(399, site.lon, site.lat, startMs, endMs),
  ]);
  return { sun, earth, source: "live" };
}

/* Build a Horizons API query URL (topocentric site on the Moon, az/el, hourly). */
function horizonsURL(target, lon, lat, startMs, endMs) {
  const p = new URLSearchParams();
  p.set("format", "text");
  p.set("COMMAND", `'${target}'`);
  p.set("OBJ_DATA", "'NO'");
  p.set("MAKE_EPHEM", "'YES'");
  p.set("EPHEM_TYPE", "'OBSERVER'");
  p.set("CENTER", "'coord@301'");
  p.set("COORD_TYPE", "'GEODETIC'");
  p.set("SITE_COORD", `'${lon},${lat},0'`);
  p.set("START_TIME", `'${isoHM(startMs)}'`);
  p.set("STOP_TIME", `'${isoHM(endMs)}'`);
  p.set("STEP_SIZE", "'1h'");
  p.set("QUANTITIES", "'4'");
  p.set("ANG_FORMAT", "'DEG'");
  p.set("CSV_FORMAT", "'YES'");
  p.set("TIME_DIGITS", "'MINUTES'");
  return "https://ssd.jpl.nasa.gov/api/horizons.api?" + p.toString();
}
function isoHM(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* Parse a Horizons CSV ephemeris body into {t0,step,az,el}. */
function parseHorizons(text) {
  const m = text.match(/\$\$SOE\r?\n([\s\S]*?)\$\$EOE/);
  if (!m) throw new Error("Horizons returned no table (check date range / connection)");
  const rows = [];
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(",");
    if (f.length < 5) continue;
    const dm = f[0].trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})/);
    if (!dm) continue;
    const t = Date.UTC(+dm[1], MON[dm[2]], +dm[3], +dm[4], +dm[5]) / 1000;
    const az = parseFloat(f[3]), el = parseFloat(f[4]);
    if (isNaN(t) || isNaN(az) || isNaN(el)) continue;
    rows.push([t, az, el]);
  }
  if (rows.length < 2) throw new Error("empty ephemeris table");
  return {
    t0: rows[0][0], step: 3600,
    az: rows.map(r => Math.round(r[1] * 100) / 100),
    el: rows.map(r => Math.round(r[2] * 1000) / 1000),
  };
}

/* Live fetch: direct first (blocked by CORS in most browsers), then public relays. */
async function liveFetch(target, lon, lat, startMs, endMs) {
  const url = horizonsURL(target, lon, lat, startMs, endMs);
  const attempts = [
    url,
    "https://r.jina.ai/" + url,
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    "https://corsproxy.io/?url=" + encodeURIComponent(url),
  ];
  let lastErr = null;
  for (const u of attempts) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = await r.text();
      return parseHorizons(text);
    } catch (e) { lastErr = e; }
  }
  throw new Error("live Horizons fetch failed: " + (lastErr ? lastErr.message : "unknown"));
}

/* ---------------- metrics ---------------- */

function computeStats(sc, refMs) {
  const sun = sc.sun, earth = sc.earth;
  const startMs = sc.startMs != null ? sc.startMs : sun.t0 * 1000;
  const endMs = sc.endMs != null ? sc.endMs : (sun.t0 + (sun.el.length - 1) * sun.step) * 1000;
  const n = sun.el.length;
  const sunUp = i => sun.el[i] > 0, earthUp = i => earth.el[i] > 0;
  let sunPct = 0, earthPct = 0, bothPct = 0;
  for (let i = 0; i < n; i++) {
    const s = sunUp(i), e = earthUp(i);
    if (s) sunPct++;
    if (e) earthPct++;
    if (s && e) bothPct++;
  }
  /* longest continuous sunlit run */
  let best = 0, run = 0;
  for (let i = 0; i < n; i++) {
    run = sunUp(i) ? run + 1 : 0;
    if (run > best) best = run;
  }
  let sunMaxEl = -91, sunMaxI = 0;
  for (let i = 0; i < n; i++) if (sun.el[i] > sunMaxEl) { sunMaxEl = sun.el[i]; sunMaxI = i; }
  let earthMinEl = 91, earthMaxEl = -91;
  for (let i = 0; i < earth.el.length; i++) {
    if (earth.el[i] < earthMinEl) earthMinEl = earth.el[i];
    if (earth.el[i] > earthMaxEl) earthMaxEl = earth.el[i];
  }
  const sunX = crossings(sun), earthX = crossings(earth);
  const ref = refMs / 1000;
  const nextSet = (xs) => xs.find(x => x.t > ref && !x.up);
  const nextRise = (xs) => xs.find(x => x.t > ref && x.up);
  return {
    n,
    sunPct: 100 * sunPct / n, earthPct: 100 * earthPct / n, bothPct: 100 * bothPct / n,
    longestDaylightMs: Math.min(best * sun.step * 1000, endMs - startMs),
    sunMaxEl, sunMaxT: (sun.t0 + sunMaxI * sun.step) * 1000,
    earthMinEl, earthMaxEl,
    sunNextSet: nextSet(sunX), sunNextRise: nextRise(sunX),
    earthNextSet: nextSet(earthX), earthNextRise: nextRise(earthX),
  };
}

/* ---------------- scenario rendering ---------------- */

function renderScenario() {
  const sc = current;
  $("scenarioView").hidden = false;
  $("scenTitle").textContent = sc.site.name;
  const approx = sc.site.approx ? " (coordinates approximate)" : "";
  const src = sc.source === "cache"
    ? "precomputed JPL Horizons dataset (2025–2029)"
    : "live JPL Horizons fetch (experimental)";
  $("scenMeta").innerHTML =
    `lon ${sc.site.lon}°E, lat ${sc.site.lat}°${approx} · window ${fmtUTC(sc.startMs)} → ` +
    `${fmtUTC(sc.endMs)} · data: ${src}`;
  scrubT = sc.startMs + (sc.endMs - sc.startMs) * ($("scrub").value / 1000);
  updateLinks();
  drawAll();
}

function updateLinks() {
  const sc = current;
  const lon = sc.site.lon, lat = sc.site.lat;
  $("qmLink").href = `https://quickmap.lroc.im-ldi.com/?features=${lon},${lat}`;
  $("mtLink").href = `https://trek.nasa.gov/moon/#lon=${lon}&lat=${lat}&zoom=5`;
  $("hzLink").href = horizonsURL(10, lon, lat, sc.startMs, sc.endMs);
}

function renderMetrics() {
  const sc = current;
  const st = computeStats(sc, scrubT);
  const sunNow = interp(sc.sun, scrubT / 1000);
  const earthNow = interp(sc.earth, scrubT / 1000);
  const pct = (x) => (Math.round(x * 10) / 10) + "%";
  const deg = (x) => (x >= 0 ? "+" : "") + (Math.round(x * 100) / 100) + "°";

  const cards = [];
  const card = (cls, k, v, d) => cards.push(
    `<div class="card ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d || ""}</div></div>`);

  if (sunNow && sunNow.el > 0) {
    card("sun", "Sun elevation (at scrub time)", deg(sunNow.el),
      `azimuth ${sunNow.az.toFixed(1)}° · above horizon ▲`);
  } else if (sunNow) {
    card("sun", "Sun elevation (at scrub time)", deg(sunNow.el),
      `azimuth ${sunNow.az.toFixed(1)}° · below horizon ▼`);
  }
  const sunDown = sunNow ? sunNow.el <= 0 : true;
  const nx = sunDown ? st.sunNextRise : st.sunNextSet;
  if (nx) {
    card("", sunDown ? "Next sunrise" : "Next sunset",
      "in " + fmtCountdown(nx.t * 1000 - scrubT),
      fmtUTC(nx.t * 1000));
  } else {
    card("", "Next sun crossing", "—", "no sunrise/sunset inside this window");
  }
  card("sun", "Peak Sun elevation", deg(st.sunMaxEl), "on " + fmtDay(st.sunMaxT));
  card("", "Sunlit", pct(st.sunPct) + " of window",
      "longest continuous daylight: " + fmtCountdown(st.longestDaylightMs));

  if (earthNow) {
    card("earth", "Earth elevation (at scrub time)", deg(earthNow.el),
      `azimuth ${earthNow.az.toFixed(1)}° · ${earthNow.el > 0 ? "visible ▲" : "below horizon ▼"}`);
  }
  const earthDown = earthNow ? earthNow.el <= 0 : false;
  const enx = earthDown ? st.earthNextRise : st.earthNextSet;
  card("earth", "Earth visibility", pct(st.earthPct) + " of window",
    `elevation range ${deg(st.earthMinEl)} … ${deg(st.earthMaxEl)}` +
    (st.earthPct < 100 && enx ? ` · next Earth${earthDown ? "rise" : "set"} ${fmtUTC(enx.t * 1000)}` : ""));
  if (sunNow) {
    const eff = Math.max(0, Math.sin(sunNow.el * Math.PI / 180) * 100);
    card("", "Solar power proxy (level panel)", Math.round(eff) + "%",
      "sin(elevation) incidence factor — before panel/temperature limits");
  }
  card("", "Sunlit AND Earth-visible", pct(st.bothPct) + " of window",
      "full-operations window (power + direct-to-Earth)");

  $("metrics").innerHTML = cards.join("");
}

/* ---------------- charts ---------------- */

function setupCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const r = c.getBoundingClientRect();
  const w = Math.max(50, Math.round(r.width * dpr)), h = Math.max(50, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, r.width, r.height];
}

function niceYRange(lo, hi) {
  lo = Math.max(Math.min(lo, -2), -90);   /* az/el never exceed ±90° */
  hi = Math.min(Math.max(hi, 2), 90);
  const span = Math.max(hi - lo, 4);
  const step = [1, 2, 5, 10, 15, 20, 30, 45, 90].find(s => span / s <= 8) || 90;
  let y0 = Math.max(Math.floor(lo / step) * step, -90);
  let y1 = Math.min(Math.ceil(hi / step) * step, 90);
  if (y1 - y0 < step) y1 = Math.min(y0 + step, 90);
  return { y0, y1, step };
}

function timeTicks(t0, t1) {
  const span = t1 - t0;
  const steps = [3600e3, 6*3600e3, 12*3600e3, 86400e3, 2*86400e3, 7*86400e3, 14*86400e3, 30*86400e3, 90*86400e3];
  const step = steps.find(s => span / s <= 10) || 365*86400e3;
  const out = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return out;
}

/* Elevation vs time. curves: [{series, color, label}] */
function drawElevChart(canvas, t0, t1, curves, scrubMs, yDynamic) {
  const [ctx, W, H] = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);
  const L = 46, R = 12, T = 10, B = 26;
  const x = t => L + (t - t0) / (t1 - t0) * (W - L - R);
  let lo = Infinity, hi = -Infinity;
  if (yDynamic) {
    for (const c of curves) for (const e of c.series.el) { if (e < lo) lo = e; if (e > hi) hi = e; }
  } else { lo = -90; hi = 90; }
  const yr = yDynamic ? niceYRange(lo, hi) : { y0: -90, y1: 90, step: 30 };
  const y = e => T + (yr.y1 - e) / (yr.y1 - yr.y0) * (H - T - B);

  /* night region below horizon */
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fillRect(L, y(0), W - L - R, H - B - y(0));
  /* grid */
  ctx.strokeStyle = "#2a3340"; ctx.fillStyle = "#8b98a8";
  ctx.font = "11px sans-serif"; ctx.lineWidth = 1;
  for (let e = yr.y0; e <= yr.y1; e += yr.step) {
    ctx.beginPath(); ctx.moveTo(L, y(e)); ctx.lineTo(W - R, y(e)); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(e + "°", L - 6, y(e) + 4);
  }
  ctx.textAlign = "center";
  for (const t of timeTicks(t0, t1)) {
    ctx.fillText(fmtDay(t), x(t), H - 8);
  }
  /* horizon */
  ctx.strokeStyle = "#55637a"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(L, y(0)); ctx.lineTo(W - R, y(0)); ctx.stroke();
  ctx.fillStyle = "#55637a"; ctx.textAlign = "left"; ctx.fillText("horizon 0°", L + 4, y(0) - 5);

  /* curves */
  for (const c of curves) {
    ctx.strokeStyle = c.color; ctx.lineWidth = 1.6;
    ctx.beginPath();
    const stride = Math.max(1, Math.ceil((c.series.el.length - 1) / 1600));
    let started = false;
    for (let i = 0; i < c.series.el.length; i += stride) {
      const t = c.series.t0 + i * c.series.step;
      const px = x(t * 1000), py = y(c.series.el[i]);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  /* scrub line + dots */
  if (scrubMs != null) {
    const sx = x(scrubMs);
    ctx.strokeStyle = "#4ecdc4"; ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(sx, T); ctx.lineTo(sx, H - B); ctx.stroke();
    ctx.setLineDash([]);
    for (const c of curves) {
      const p = interp(c.series, scrubMs / 1000);
      if (!p) continue;
      ctx.fillStyle = c.color;
      ctx.beginPath(); ctx.arc(sx, y(p.el), 4.5, 0, 7); ctx.fill();
    }
  }
}

/* Sky dome: N up, E left; center = zenith (90°). */
function drawDome(canvas, sc, scrubMs) {
  const [ctx, W, H] = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 26;
  const pt = (az, el) => {
    const a = az * Math.PI / 180;
    const r = R * (1 - Math.max(0, el) / 90);
    return [cx - r * Math.sin(a), cy - r * Math.cos(a)];
  };
  ctx.fillStyle = "#10151c";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = "#3a4657"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
  ctx.font = "11px sans-serif"; ctx.fillStyle = "#8b98a8"; ctx.textAlign = "center";
  ctx.fillText("N", cx, cy - R - 8); ctx.fillText("S", cx, cy + R + 16);
  ctx.textAlign = "left"; ctx.fillText("W", cx - R - 18, cy + 4);
  ctx.textAlign = "right"; ctx.fillText("E", cx + R + 18, cy + 4);
  for (const e of [30, 60]) {
    const r = R * (1 - e / 90);
    ctx.strokeStyle = "#232d3a"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    ctx.fillStyle = "#5c6a7c"; ctx.textAlign = "left";
    ctx.fillText("+" + e + "°", cx + 4, cy - r + 12);
  }
  ctx.fillText("zenith", cx + 4, cy + 3);

  /* paths */
  const drawPath = (series, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.4;
    const n = series.el.length;
    const stride = Math.max(1, Math.ceil(n / 400));
    let pen = false;
    ctx.beginPath();
    for (let i = 0; i < n; i += stride) {
      if (series.el[i] > 0) {
        const [px, py] = pt(series.az[i], series.el[i]);
        if (!pen) { ctx.moveTo(px, py); pen = true; }
        else ctx.lineTo(px, py);
      } else pen = false;
    }
    ctx.stroke();
  };
  drawPath(sc.sun, SUN_C);
  drawPath(sc.earth, EARTH_C);

  /* current positions */
  const belowNotes = [];
  const drawNow = (series, color, label) => {
    const p = interp(series, scrubMs / 1000);
    if (!p) return;
    if (p.el > 0) {
      const [px, py] = pt(p.az, p.el);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, 7); ctx.fill();
      ctx.fillStyle = "#dce3ec"; ctx.textAlign = "left"; ctx.font = "12px sans-serif";
      ctx.fillText(`${label} ${p.el.toFixed(1)}°`, px + 10, py - 8);
    } else {
      /* below horizon: hollow marker at the horizon edge, text moved to a corner */
      const [px, py] = pt(p.az, 0);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.stroke();
      belowNotes.push({ color, text: `${label} ${p.el.toFixed(1)}° — below horizon` });
    }
  };
  drawNow(sc.earth, EARTH_C, "Earth");
  drawNow(sc.sun, SUN_C, "Sun");
  belowNotes.forEach((n, i) => {
    ctx.font = "11px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, 10, H - 10 - (belowNotes.length - 1 - i) * 15);
  });
  /* legend */
  ctx.textAlign = "right"; ctx.font = "11px sans-serif";
  ctx.fillStyle = SUN_C; ctx.fillText("Sun path", W - 10, 16);
  ctx.fillStyle = EARTH_C; ctx.fillText("Earth path", W - 10, 32);
}

/* Operational windows bars. */
function drawWindows(canvas, sc, scrubMs) {
  const [ctx, W, H] = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);
  const L = 70, R = 12, T = 8, B = 26;
  const lanes = [
    { label: "Sun up", color: SUN_C, test: i => sc.sun.el[i] > 0 },
    { label: "Earth up", color: EARTH_C, test: i => sc.earth.el[i] > 0 },
    { label: "Both", color: "#7ec850", test: i => sc.sun.el[i] > 0 && sc.earth.el[i] > 0 },
  ];
  const laneH = Math.min(30, Math.floor((H - T - B) / lanes.length - 8));
  const t0 = sc.startMs, t1 = sc.endMs;
  const x = t => L + (t - t0) / (t1 - t0) * (W - L - R);
  const n = sc.sun.el.length;
  ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = "#8b98a8";
  lanes.forEach((ln, li) => {
    const y0 = T + li * (laneH + 8);
    ctx.strokeStyle = "#232d3a";
    ctx.strokeRect(L, y0, W - L - R, laneH);
    ctx.fillStyle = "#8b98a8";
    ctx.fillText(ln.label, L - 8, y0 + laneH / 2 + 4);
    ctx.fillStyle = ln.color;
    for (let i = 0; i < n - 1; i++) {
      if (!ln.test(i)) continue;
      const a = x((sc.sun.t0 + i * sc.sun.step) * 1000);
      const b = x((sc.sun.t0 + (i + 1) * sc.sun.step) * 1000);
      ctx.fillRect(a, y0 + 2, Math.max(b - a, 1), laneH - 4);
    }
  });
  ctx.textAlign = "center";
  for (const t of timeTicks(t0, t1)) ctx.fillText(fmtDay(t), x(t), H - 8);
  if (scrubMs != null) {
    ctx.strokeStyle = "#4ecdc4"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x(scrubMs), T); ctx.lineTo(x(scrubMs), H - B); ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawAll() {
  const sc = current;
  if (!sc) return;
  drawElevChart($("elevChart"), sc.startMs, sc.endMs,
    [{ series: sc.sun, color: SUN_C }, { series: sc.earth, color: EARTH_C }],
    scrubT, true);
  drawDome($("domeChart"), sc, scrubT);
  drawWindows($("windowsChart"), sc, scrubT);
  renderMetrics();
  renderScrubReadout();
}

function renderScrubReadout() {
  const sc = current;
  const sunNow = interp(sc.sun, scrubT / 1000);
  const earthNow = interp(sc.earth, scrubT / 1000);
  $("scrubTime").textContent = fmtUTC(scrubT);
  $("scrubSun").textContent = sunNow
    ? `${sunNow.el.toFixed(2)}° el · ${sunNow.az.toFixed(1)}° az` : "—";
  $("scrubEarth").textContent = earthNow
    ? `${earthNow.el.toFixed(2)}° el · ${earthNow.az.toFixed(1)}° az` : "—";
  const st = computeStats(sc, scrubT);
  const f = (x) => x ? "in " + fmtCountdown(x.t * 1000 - scrubT) : "— (none in window)";
  $("scrubNextSet").textContent = st.sunNextSet ? f(st.sunNextSet)
    : st.sunNextRise ? "sun down · sunrise " + f(st.sunNextRise) : "—";
  $("scrubNextESet").textContent = st.earthPct === 0 ? "never up in this window (far side?)"
    : st.earthNextSet ? f(st.earthNextSet)
    : st.earthNextRise ? "Earth down · rise " + f(st.earthNextRise)
    : "— (always up in window)";
}

/* ---------------- scrubber & animation ---------------- */

function scrubFromSlider() {
  const sc = current;
  if (!sc) return;
  const v = $("scrub").value / 1000;
  scrubT = sc.startMs + (sc.endMs - sc.startMs) * v;
  drawAll();
}

function setScrub(t) {
  const sc = current;
  if (!sc) return;
  scrubT = Math.min(Math.max(t, sc.startMs), sc.endMs);
  $("scrub").value = Math.round((scrubT - sc.startMs) / (sc.endMs - sc.startMs) * 1000);
  drawAll();
}

function togglePlay() {
  playing = !playing;
  $("playBtn").textContent = playing ? "❚❚ Pause" : "▶ Play";
  if (playing) {
    playT0 = performance.now();
    scrubAtPlay = scrubT;
    rafId = requestAnimationFrame(step);
  } else if (rafId) cancelAnimationFrame(rafId);
}
function step(ts) {
  if (!playing || !current) return;
  const span = current.endMs - current.startMs;
  const speed = span / 60000; /* window plays over ~60 s */
  setScrub(scrubAtPlay + (ts - playT0) * speed);
  if (scrubT >= current.endMs - 1) { playing = false; $("playBtn").textContent = "▶ Play"; return; }
  rafId = requestAnimationFrame(step);
}

/* ---------------- comparison ---------------- */

function compareKey(c) { return JSON.stringify([c.site.id, c.site.lon, c.site.lat, c.startMs, c.dur]); }

function addCompare() {
  if (!current) return;
  const c = { site: current.site, startMs: current.startMs, dur: current.dur, series: current };
  if (compares.some(x => compareKey(x) === compareKey(c))) { status("Already in comparison."); return; }
  if (compares.length >= 6) { status("Comparison is full (6 scenarios).", true); return; }
  compares.push(c);
  saveCompares();
  renderCompare();
}

function saveCompares() { /* persistence is in-memory only (sandboxed previews have no storage) */ }

async function restoreCompares() { /* nothing to restore without storage */ }

async function ensureSeries(c) {
  if (c.series) return c.series;
  const endMs = c.startMs + c.dur * 86400e3;
  c.series = await getSeries(c.site, c.startMs, endMs);
  return c.series;
}

function renderCompare() {
  const view = $("compareView");
  if (!compares.length) { view.hidden = true; return; }
  view.hidden = false;

  const th = (h) => `<th>${h}</th>`;
  const rows = [];
  for (let i = 0; i < compares.length; i++) {
    const c = compares[i];
    if (!c.series) continue;
    const st = computeStats(
      { sun: c.series.sun, earth: c.series.earth, startMs: c.startMs, endMs: c.startMs + c.dur * 86400e3 },
      c.startMs);
    const pct = (x) => (Math.round(x * 10) / 10) + "%";
    const deg = (x) => (x >= 0 ? "+" : "") + (Math.round(x * 100) / 100) + "°";
    rows.push(
      `<tr><td>${c.site.name}</td>` +
      `<td>${fmtDay(c.startMs)}<br><span class="sub">${c.dur} days</span></td>` +
      `<td>${deg(st.sunMaxEl)} <span class="sub">(${fmtDay(st.sunMaxT)})</span></td>` +
      `<td>${pct(st.sunPct)}</td>` +
      `<td>${fmtCountdown(st.longestDaylightMs)}</td>` +
      `<td>${deg(st.earthMinEl)} … ${deg(st.earthMaxEl)}</td>` +
      `<td>${pct(st.earthPct)}</td>` +
      `<td>${pct(st.bothPct)}</td>` +
      `<td><span class="rm" title="remove" data-i="${i}">✕</span></td></tr>`);
  }
  $("compareTable").innerHTML = "<thead><tr>" +
    ["Site", "Window", "Peak Sun el.", "Sunlit", "Longest daylight",
     "Earth el. range", "Earth up", "Sun+Earth", ""].map(th).join("") +
    "</tr></thead><tbody>" + rows.join("") + "</tbody>";
  $("compareTable").querySelectorAll(".rm").forEach(el =>
    el.addEventListener("click", () => {
      compares.splice(+el.dataset.i, 1); saveCompares(); renderCompare();
    }));

  /* overlay chart: sun elevation for each scenario on a shared absolute-time axis */
  const t0 = Math.min(...compares.map(c => c.startMs));
  const t1 = Math.max(...compares.map(c => c.startMs + c.dur * 86400e3));
  const curves = compares.map((c, i) => ({
    series: c.series.sun, color: PALETTE[i % PALETTE.length], label: c.site.name,
  }));
  drawElevChart($("compareChart"), t0, t1, curves, null, true);
  const [ctx, W, H] = setupCanvas($("compareChart"));
  ctx.font = "11px sans-serif"; ctx.textAlign = "right";
  curves.forEach((c, i) => {
    ctx.fillStyle = c.color;
    ctx.fillText(c.label, W - 10, 14 + i * 15);
  });
}

/* ---------------- UI wiring ---------------- */

async function loadScenario() {
  const sel = $("siteSelect");
  let site;
  if (sel.value === "custom") {
    const lat = parseFloat($("latInput").value);
    const lon = parseFloat($("lonInput").value);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 360) {
      status("Enter valid coordinates (lat -90..90, lon -180..360).", true);
      return;
    }
    site = { id: "custom", name: `Custom site (${lon}°E, ${lat}°)`, lon, lat, approx: false };
  } else {
    site = SITES.find(s => s.id === sel.value);
  }
  if (!site) return;
  let startMs;
  const v = $("startInput").value;
  if (v) startMs = Date.parse(v + ":00Z".slice(v.length === 16 ? 3 : 0)) || Date.now();
  if (!startMs || isNaN(startMs)) startMs = Date.now();
  startMs = Math.round(startMs / 3600e3) * 3600e3; /* snap to whole UTC hour */
  const dur = parseInt($("durationSelect").value, 10);
  const endMs = startMs + dur * 86400e3;

  const useCache = site.id !== "custom" && startMs / 1000 >= CACHE_START && endMs / 1000 <= CACHE_END;
  status(useCache ? "Loading cached Horizons data…" :
    "Fetching live from JPL Horizons (this can take ~10 s)…");
  try {
    const res = await getSeries(site, startMs, endMs);
    current = { site, startMs, endMs, dur, sun: res.sun, earth: res.earth, source: res.source };
    $("scrub").value = 0;
    renderScenario();
    status("Loaded " + site.name + " · " + (res.source === "cache" ? "precomputed data" : "live Horizons fetch") + ".");
  } catch (e) {
    status("Could not load scenario: " + e.message +
      " — live fetches need internet access to JPL Horizons via a CORS relay; try a curated site/date.", true);
  }
}

function init() {
  const now = new Date();
  $("startInput").value =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}T${pad(now.getUTCHours())}:00`;
  $("siteSelect").addEventListener("change", () => {
    $("customCoords").hidden = $("siteSelect").value !== "custom";
  });
  $("loadBtn").addEventListener("click", loadScenario);
  $("compareBtn").addEventListener("click", addCompare);
  $("clearCompare").addEventListener("click", () => { compares = []; saveCompares(); renderCompare(); });
  $("scrub").addEventListener("input", scrubFromSlider);
  $("playBtn").addEventListener("click", togglePlay);
  $("nowBtn").addEventListener("click", () => setScrub(Date.now()));
  $("startInput").addEventListener("keydown", e => { if (e.key === "Enter") loadScenario(); });

  let rsz;
  window.addEventListener("resize", () => {
    clearTimeout(rsz);
    rsz = setTimeout(() => { if (current) drawAll(); if (compares.length) renderCompare(); }, 150);
  });

  populateSelect();
  initSplash();
  loadScenario(); /* default: Shackleton rim, 30 days from now */
}

/* ---------------- splash screen ---------------- */

function initSplash() {
  const splash = $("splash"), video = $("splashVideo");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    video.pause();
    splash.classList.add("gone");
    $("gate").hidden = false;
    setTimeout(() => splash.remove(), 700);
    if (current) drawAll(); 
  };
  video.onended = finish;
  video.onerror = finish;               /* missing video: skip */
  $("splashSkip").addEventListener("click", finish);
  splash.addEventListener("click", finish);
  setTimeout(finish, 15000);             /* never hold the user longer than 15 s */
}

document.addEventListener("DOMContentLoaded", init);
