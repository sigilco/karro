# karro-shim

FastAPI data shim implementing the frozen Karro `/v1` contract over Málaga's
no-CORS open-data feeds (SMASSA garage occupancy), OSRM routing, and Nominatim
geocoding. Everything is served with `Access-Control-Allow-Origin: *`.
No secrets required.

## Run locally

```bash
cd apps/shim
uv sync                       # or: pip install -e .
uvicorn app.main:app --port 8791
# plain pip path also works: python -m uvicorn app.main:app --port 8791
```

The background poller hits the SMASSA occupancy CSV every 60 s; the first
`GET /v1/facilities` returns live values as soon as the first poll lands
(until then `available`/`velocityPerMin` are `null` and `projected` is `[]`).

## Data

Runtime data lives in `static/` (self-contained for the Docker image):

- `catalogo.csv` — baked SMASSA garage catalog (coords, names)
- `garages_extra.csv` — two feed ids missing from the upstream catalog
  (`SA` Salitre, `CR` Cruz de Humilladero), coords via Nominatim + SMASSA site
- `zones.geojson` — SARE sector polygons (identical copy at repo `data/` and
  `public/`; sector names from `plazas_sare.csv`, geometry hand-authored —
  the dataset ships street counts, no lat/lon)

To point the shim at the repo-level `data/` dir instead, ensure `static/` is
absent or set nothing — resolution order is `apps/shim/static/` then repo
`data/`.

## Docker

```bash
docker build -t karro-shim apps/shim        # context: repo root or apps/shim
docker run -p 8080:8080 karro-shim          # uvicorn on $PORT (default 8080)
```

## Endpoints

| Path | Description |
|---|---|
| `GET /v1/health` | feed age, observation count, uptime |
| `GET /v1/facilities` | SMASSA garages: live `libres`, 15-min least-squares `velocityPerMin`, +5/+10/+15/+20 `projected` |
| `GET /v1/zones.geojson` | baked SARE zone FeatureCollection |
| `GET /v1/rules?lat&lon` | point-in-polygon legality verdict (Europe/Madrid SARE hours) |
| `GET /v1/eta?from_lat&from_lon&to_lat&to_lon` | OSRM drive time + haversine walk, `estimate` fallback |
| `GET /v1/geocode?q` | Nominatim proxy, Málaga viewbox, 1 req/s, 60 s cache |
| `GET /v1/forecast/{city}/{date}` | citywide verdict heuristic (`malaga` only) |
| `GET /v1/observations` | raw 30-min ring buffer dump (debug) |

## Lint

```bash
uv run ruff check app
```
