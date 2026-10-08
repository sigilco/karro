"""Karro POC data shim — FastAPI surface implementing the frozen /v1 contract.

Wraps the no-CORS Málaga open-data feeds plus OSRM/Nominatim behind a
CORS-open JSON API the One web app can call. No secrets required.
"""

from __future__ import annotations

import asyncio
import csv
import json
import logging
import math
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Config ──────────────────────────────────────────────────────────────────

HERE = Path(__file__).resolve().parent
# Prefer shim-local static copies (self-contained Docker image), fall back to
# the repo-level data/ dir for in-repo development.
_DATA_CANDIDATES = [HERE.parent / "static", HERE.parent.parent.parent / "data"]
DATA_DIR = next((d for d in _DATA_CANDIDATES if (d / "catalogo.csv").exists()), _DATA_CANDIDATES[0])

SMASSA_OCCUPANCY_URL = (
    "https://datosabiertos.malaga.eu/recursos/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv"
)
OSRM_URL = "https://router.project-osrm.org/route/v1/driving/{flon},{flat};{tlon},{tlat}?overview=false"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

USER_AGENT = "karro-poc/0.1 (parking availability POC; contact: dev)"
POLL_INTERVAL_S = 60
RING_WINDOW_S = 30 * 60
VELOCITY_WINDOW_S = 15 * 60
GEOCODE_CACHE_S = 60
MADRID = ZoneInfo("Europe/Madrid")
SARE_HOURS_TEXT = "Mon–Fri 9–14 & 16–20, Sat 9–14"

log = logging.getLogger("karro-shim")

# ── SMASSA feed state ────────────────────────────────────────────────────────

START_TS = time.time()
ring: deque[tuple[float, str, int]] = deque()  # (ts, facility_id, libres)
last_good_poll: float | None = None
last_poll_snapshot: dict[str, int] = {}  # id -> libres from last good poll
observed_max: dict[str, int] = {}  # id -> max libres ever seen
per_id_last_seen: dict[str, float] = {}
observations_total = 0
poll_task: asyncio.Task | None = None

# ── Catalog (baked) ─────────────────────────────────────────────────────────


def load_catalog() -> dict[str, dict]:
    """Merge data/catalogo.csv with data/garages_extra.csv (feed ids missing upstream)."""
    out: dict[str, dict] = {}
    for name in ("catalogo.csv", "garages_extra.csv"):
        path = DATA_DIR / name
        if not path.exists():
            continue
        with path.open(newline="", encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                fid = row["id"].strip()
                if not fid:
                    continue
                out.setdefault(
                    fid,
                    {
                        "name": row["nombre"].strip(),
                        "lat": float(row["latitude"]),
                        "lon": float(row["longitude"]),
                    },
                )
    return out


CATALOG = load_catalog()


def load_zones() -> dict:
    path = DATA_DIR / "zones.geojson"
    if not path.exists():
        return {"type": "FeatureCollection", "features": []}
    return json.loads(path.read_text(encoding="utf-8"))


ZONES = load_zones()

# ── Poller ───────────────────────────────────────────────────────────────────


def ingest_poll(now: float, rows: list[tuple[str, int]]) -> None:
    global observations_total
    last_poll_snapshot.clear()
    for fid, libres in rows:
        ring.append((now, fid, libres))
        last_poll_snapshot[fid] = libres
        per_id_last_seen[fid] = now
        observed_max[fid] = max(libres, observed_max.get(fid, 0))
        observations_total += 1
    while ring and now - ring[0][0] > RING_WINDOW_S:
        ring.popleft()


async def poll_once(client: httpx.AsyncClient) -> None:
    global last_good_poll
    res = await client.get(SMASSA_OCCUPANCY_URL, timeout=20)
    res.raise_for_status()
    rows: list[tuple[str, int]] = []
    reader = csv.DictReader(res.text.splitlines())
    for row in reader:
        if row.get("dato", "").strip().upper() != "OCUPACION":
            continue
        try:
            rows.append((row["id"].strip(), int(row["libres"])))
        except (KeyError, ValueError):
            continue
    if rows:
        ingest_poll(time.time(), rows)
        last_good_poll = time.time()


async def poll_loop() -> None:
    async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        while True:
            try:
                await poll_once(client)
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                log.warning("SMASSA poll failed, serving last-good data: %s", exc)
            await asyncio.sleep(POLL_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global poll_task
    poll_task = asyncio.create_task(poll_loop())
    yield
    if poll_task:
        poll_task.cancel()


app = FastAPI()
app.title = "karro-shim"
app.version = "0.1.0"
app.router.lifespan_context = lifespan
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled(_req: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc)})


# ── Helpers ──────────────────────────────────────────────────────────────────


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def slope_per_min(samples: list[tuple[float, int]], now: float) -> float | None:
    """Least-squares slope (libres/min) over the velocity window."""
    pts = [(ts, libres) for ts, libres in samples if now - ts <= VELOCITY_WINDOW_S]
    if len(pts) < 2:
        return None
    xs = [(ts - pts[0][0]) / 60.0 for ts, _ in pts]
    ys = [float(libres) for _, libres in pts]
    n = len(xs)
    sx, sy = sum(xs), sum(ys)
    sxx = sum(x * x for x in xs)
    sxy = sum(x * y for x, y in zip(xs, ys))
    denom = n * sxx - sx * sx
    if denom == 0:
        return None
    return (n * sxy - sx * sy) / denom


def point_in_polygon(lat: float, lon: float, coords: list) -> bool:
    """Ray-cast point-in-polygon over a GeoJSON coordinate array (lon,lat order)."""
    ring_pts = coords[0]
    inside = False
    j = len(ring_pts) - 1
    for i in range(len(ring_pts)):
        xi, yi = ring_pts[i][0], ring_pts[i][1]
        xj, yj = ring_pts[j][0], ring_pts[j][1]
        if (yi > lat) != (yj > lat):
            x_int = (xj - xi) * (lat - yi) / (yj - yi) + xi
            if lon < x_int:
                inside = not inside
        j = i
    return inside


def find_zone(lat: float, lon: float) -> dict | None:
    for feat in ZONES.get("features", []):
        geom = feat.get("geometry") or {}
        if geom.get("type") == "Polygon" and point_in_polygon(lat, lon, geom["coordinates"]):
            return feat
        if geom.get("type") == "MultiPolygon":
            for poly in geom["coordinates"]:
                if point_in_polygon(lat, lon, poly):
                    return feat
    return None


def sare_enforced_now() -> bool:
    now = datetime.now(MADRID)
    wd = now.weekday()  # Mon=0 .. Sun=6
    hm = now.hour * 60 + now.minute
    if wd <= 4:  # Mon–Fri 9–14 & 16–20
        return (9 * 60 <= hm < 14 * 60) or (16 * 60 <= hm < 20 * 60)
    if wd == 5:  # Sat 9–14
        return 9 * 60 <= hm < 14 * 60
    return False  # Sunday free


def iso_now() -> str:
    return datetime.now(MADRID).isoformat(timespec="seconds")


# ── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/v1/health")
def health():
    now = time.time()
    return {
        "ok": last_good_poll is not None and now - last_good_poll < 5 * POLL_INTERVAL_S,
        "feedAgeS": round(now - last_good_poll, 1) if last_good_poll else -1,
        "observations": observations_total,
        "uptimeS": round(now - START_TS, 1),
    }


@app.get("/v1/facilities")
def facilities():
    now = time.time()
    # group ring samples per facility
    per_id: dict[str, list[tuple[float, int]]] = {}
    for ts, fid, libres in ring:
        per_id.setdefault(fid, []).append((ts, libres))

    out = []
    for fid in sorted(set(CATALOG) | set(per_id)):
        cat = CATALOG.get(fid)
        samples = per_id.get(fid, [])
        available = last_poll_snapshot.get(fid)
        capacity = observed_max.get(fid) or None
        if capacity is not None and available is not None:
            capacity = max(capacity, available)
        v = slope_per_min(samples, now) if len(samples) >= 2 else None
        if available is None:
            projected: list[float] = []
        else:
            vel = v or 0.0
            cap = capacity if capacity is not None else float("inf")
            projected = [
                round(min(max(available + vel * m, 0), cap)) for m in (5, 10, 15, 20)
            ]
        seen = per_id_last_seen.get(fid)
        out.append(
            {
                "id": fid,
                "name": cat["name"] if cat else fid,
                "lat": cat["lat"] if cat else 0.0,
                "lon": cat["lon"] if cat else 0.0,
                "kind": "garage",
                "capacity": capacity,
                "available": available,
                "velocityPerMin": round(v, 3) if v is not None else None,
                "projected": projected,
                "dataAgeS": round(now - seen, 1) if seen else -1,
            }
        )
    return {"city": "malaga", "generatedAt": iso_now(), "facilities": out}


@app.get("/v1/zones.geojson")
def zones_geojson():
    return ZONES


@app.get("/v1/rules")
def rules(lat: float = Query(...), lon: float = Query(...)):
    feat = find_zone(lat, lon)
    source = "SARE zones dataset, baked 2026-10-07"
    if feat is None:
        return {
            "verdict": "unknown",
            "zoneType": None,
            "detail": "Outside all mapped SARE zones — check on-street signage.",
            "confidence": "inferred",
            "source": source,
        }
    props = feat.get("properties", {})
    ztype = props.get("type", "unknown")
    name = props.get("name", "this zone")
    if ztype in ("loading", "resident"):
        verdict = "restricted"
        detail = f"{name}: {ztype} zone — restricted, do not park without a permit."
    elif ztype in ("sare_blue", "sare_green"):
        zona = "zona azul" if ztype == "sare_blue" else "zona verde"
        if sare_enforced_now():
            verdict = "paid"
            detail = f"{name}: SARE {zona} — paid now ({props.get('hours')}), max {props.get('maxStayMin')} min."
        else:
            verdict = "legal"
            detail = f"{name}: SARE {zona} — free now (paid {props.get('hours')})."
    elif ztype == "free":
        verdict = "legal"
        detail = f"{name}: free parking area — no SARE regime."
    else:
        verdict = "unknown"
        detail = f"{name}: unclassified zone — check on-street signage."
    return {
        "verdict": verdict,
        "zoneType": ztype,
        "detail": detail,
        "confidence": "inferred",
        "source": source,
    }


@app.get("/v1/eta")
async def eta(
    from_lat: float = Query(...),
    from_lon: float = Query(...),
    to_lat: float = Query(...),
    to_lon: float = Query(...),
):
    dist = haversine_km(from_lat, from_lon, to_lat, to_lon)
    walk_min = dist * 1.3 / 5.0 * 60.0
    try:
        async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
            res = await client.get(
                OSRM_URL.format(flon=from_lon, flat=from_lat, tlon=to_lon, tlat=to_lat),
                timeout=5,
            )
            res.raise_for_status()
            data = res.json()
            route = (data.get("routes") or [None])[0]
            if route and route.get("duration") is not None:
                return {
                    "driveMin": round(route["duration"] / 60.0, 1),
                    "walkMin": round(walk_min, 1),
                    "source": "osrm",
                }
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        log.info("OSRM unavailable, distance estimate: %s", exc)
    return {
        "driveMin": round(dist / 25.0 * 60.0, 1),
        "walkMin": round(walk_min, 1),
        "source": "estimate",
    }


_geocode_cache: dict[str, tuple[float, list]] = {}
_geocode_lock = asyncio.Lock()
_geocode_last_call = 0.0


@app.get("/v1/geocode")
async def geocode(q: str = Query(..., min_length=1)):
    global _geocode_last_call
    key = q.strip().lower()
    now = time.time()
    cached = _geocode_cache.get(key)
    if cached and now - cached[0] < GEOCODE_CACHE_S:
        return {"results": cached[1]}
    async with _geocode_lock:
        wait = 1.0 - (time.time() - _geocode_last_call)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            async with httpx.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
                res = await client.get(
                    NOMINATIM_URL,
                    params={
                        "format": "json",
                        "q": f"{q}, Málaga",
                        "viewbox": "-4.55,36.82,-4.30,36.65",
                        "bounded": "1",
                        "limit": "5",
                    },
                    timeout=10,
                )
                _geocode_last_call = time.time()
                res.raise_for_status()
                results = [
                    {
                        "name": r.get("display_name", ""),
                        "lat": float(r["lat"]),
                        "lon": float(r["lon"]),
                    }
                    for r in res.json()
                ]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            _geocode_last_call = time.time()
            raise HTTPException(status_code=502, detail=f"geocoder unavailable: {exc}")
    _geocode_cache[key] = (time.time(), results)
    return {"results": results}


@app.get("/v1/forecast/{city}/{date}")
def forecast(city: str, date: str):
    if city.lower() != "malaga":
        raise HTTPException(status_code=404, detail="only city=malaga is supported")
    now = time.time()
    total_cap = sum(observed_max.values())
    total_now = sum(last_poll_snapshot.values())
    projected_min = 0
    per_id: dict[str, list[tuple[float, int]]] = {}
    for ts, fid, libres in ring:
        per_id.setdefault(fid, []).append((ts, libres))
    for fid, samples in per_id.items():
        avail = last_poll_snapshot.get(fid)
        if avail is None:
            continue
        v = slope_per_min(samples, now) or 0.0
        cap = observed_max.get(fid, avail)
        projected_min += int(min(max(avail + v * 20, 0), cap))
    if total_cap <= 0:
        verdict = "MEDIUM"
        detail = "Live SMASSA feed unavailable — no reliable forecast; check again shortly."
    else:
        ratio = projected_min / total_cap
        if ratio > 0.15:
            verdict = "EASY"
        elif ratio < 0.05:
            verdict = "HARD"
        else:
            verdict = "MEDIUM"
        detail = (
            f"{len(last_poll_snapshot)} garages reporting: ~{total_now} free now, "
            f"~{projected_min} projected in 20 min ({round(ratio * 100)}% of capacity)."
        )
    arrive_by = None
    if verdict != "EASY":
        now_m = datetime.now(MADRID)
        mins = (now_m.minute // 30 + 1) * 30
        arrive_by = f"{(now_m.hour + mins // 60) % 24:02d}:{mins % 60:02d}"
    return {
        "city": "malaga",
        "date": date,
        "generatedAt": iso_now(),
        "verdict": verdict,
        "arriveBy": arrive_by,
        "detail": detail,
    }


@app.get("/v1/observations")
def observations():
    return {
        "generatedAt": iso_now(),
        "count": len(ring),
        "samples": [
            {"ts": round(ts, 1), "id": fid, "libres": libres}
            for ts, fid, libres in list(ring)[-500:]
        ],
    }
