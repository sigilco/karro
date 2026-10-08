// Karro POC data API — shared core implementing the /v1 contract.
// Runtime-agnostic: node entry (index.ts) polls on a setInterval; the CF
// Worker entry (worker.ts) polls from a cron trigger inside a Durable Object.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { CATALOG as CATALOG_ROWS, SECTOR_SPACES, ZONES } from "./data.ts";
import type { ExtSignalRow } from "./sources/types.ts";
import { haversineKm, madridDayKey } from "./sources/util.ts";

export const SMASSA_OCCUPANCY_URL =
  "https://datosabiertos.malaga.eu/recursos/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "karro-poc/0.1 (parking availability POC; contact: dev)";
export const POLL_INTERVAL_MS = 60_000;
const RING_WINDOW_MS = 30 * 60_000;
const VELOCITY_WINDOW_MS = 15 * 60_000;
const GEOCODE_CACHE_MS = 60_000;

// ── State ──────────────────────────────────────────────────────────────────

export interface FeedState {
  startMs: number;
  ring: { ts: number; id: string; libres: number }[];
  lastGoodPollMs: number | null;
  lastPollSnapshot: Map<string, number>;
  observedMax: Map<string, number>;
  perIdLastSeen: Map<string, number>;
  observationsTotal: number;
}

export function createFeedState(): FeedState {
  return {
    startMs: Date.now(),
    ring: [],
    lastGoodPollMs: null,
    lastPollSnapshot: new Map(),
    observedMax: new Map(),
    perIdLastSeen: new Map(),
    observationsTotal: 0,
  };
}

export function serializeState(s: FeedState): string {
  return JSON.stringify({
    startMs: s.startMs,
    ring: s.ring,
    lastGoodPollMs: s.lastGoodPollMs,
    lastPollSnapshot: [...s.lastPollSnapshot],
    observedMax: [...s.observedMax],
    perIdLastSeen: [...s.perIdLastSeen],
    observationsTotal: s.observationsTotal,
  });
}

export function restoreState(json: string): FeedState {
  const d = JSON.parse(json);
  return {
    startMs: d.startMs ?? Date.now(),
    ring: d.ring ?? [],
    lastGoodPollMs: d.lastGoodPollMs ?? null,
    lastPollSnapshot: new Map(d.lastPollSnapshot ?? []),
    observedMax: new Map(d.observedMax ?? []),
    perIdLastSeen: new Map(d.perIdLastSeen ?? []),
    observationsTotal: d.observationsTotal ?? 0,
  };
}

// ── Tiny CSV parser (quoted fields, CRLF) ────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  const header = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const CATALOG = new Map(CATALOG_ROWS.map((c) => [c.id, c]));

// ── Poll ────────────────────────────────────────────────────────────────────

function ingestPoll(state: FeedState, nowMs: number, rows: { fid: string; libres: number }[]) {
  state.lastPollSnapshot.clear();
  for (const { fid, libres } of rows) {
    state.ring.push({ ts: nowMs, id: fid, libres });
    state.lastPollSnapshot.set(fid, libres);
    state.perIdLastSeen.set(fid, nowMs);
    state.observedMax.set(fid, Math.max(libres, state.observedMax.get(fid) ?? 0));
    state.observationsTotal++;
  }
  while (state.ring.length && nowMs - state.ring[0].ts > RING_WINDOW_MS) state.ring.shift();
}

export async function pollOnce(state: FeedState, history?: HistoryStore): Promise<void> {
  const res = await fetch(SMASSA_OCCUPANCY_URL, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`SMASSA ${res.status}`);
  const rows = parseCsv(await res.text())
    .filter((r) => (r.dato ?? "").trim().toUpperCase() === "OCUPACION")
    .map((r) => ({ fid: (r.id ?? "").trim(), libres: Number(r.libres) }))
    .filter((r) => r.fid && Number.isFinite(r.libres));
  if (rows.length) {
    ingestPoll(state, Date.now(), rows);
    state.lastGoodPollMs = Date.now();
    history?.recordPoll(Date.now(), state.lastPollSnapshot);
  }
}

// ── History (long-horizon persistence — DO SQLite in prod) ───────────────────
// Seasonal predictions need 1y+ of observations; the 30-min ring can't hold
// that, so each poll is appended to obs_minute and rolled up hourly into
// obs_hour (hourOfWeek 0–167, Madrid time). User park/depart reports land in
// park_events — the seed for street-level availability once coverage accrues.

export interface HistoryStore {
  recordPoll(nowMs: number, snapshot: ReadonlyMap<string, number>): void;
  recordParkEvent(e: {
    ts: number;
    kind: "park" | "depart";
    lat: number;
    lon: number;
    clientId?: string;
  }): void;
  /** avg free spaces for a facility at this hour-of-week (0–167), null when cold */
  hourlyBaseline(id: string, hourOfWeek: number): number | null;
  /** days of hourly rollups on record */
  historyDepthDays(): number;
  /** park/depart events within radiusKm of a point */
  parkEventCount(lat: number, lon: number, radiusKm: number): number;
  // ── External signals (Part B) — optional: the node dev entry can run
  // without them. SqlHistory persists them in ext_signal.
  /** Replace a source's whole snapshot (bounded: ~latest rows only). */
  replaceSignals?(source: string, rows: ExtSignalRow[], nowMs: number): void;
  /** Latest snapshot rows for one source. */
  signals?(source: string): ExtSignalRow[];
  /** ms of the source's last successful poll (0 = never). */
  signalLastPollMs?(source: string): number;
  /** Per-source row count + freshness for /v1/signals. */
  signalStats?(): { source: string; rows: number; lastPollMs: number }[];
}

export function madridHourOfWeek(ts: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const h = Number(get("hour")) % 24;
  return Math.max(0, wd) * 24 + h;
}

// In-memory HistoryStore for the node dev entry — same semantics as
// SqlHistory, unbounded-ish but fine for local runs (it dies with the process).
export function createMemoryHistory(): Required<HistoryStore> {
  const minute: { ts: number; id: string; libres: number }[] = [];
  const hourAgg = new Map<
    string,
    { how: number; sum: number; n: number; min: number; max: number; hourTs: number }
  >();
  const parkEvents: { ts: number; kind: string; lat: number; lon: number }[] = [];
  const signals = new Map<string, ExtSignalRow[]>();
  const lastPoll = new Map<string, number>();
  return {
    recordPoll(nowMs, snap) {
      const hourTs = Math.floor(nowMs / 3_600_000) * 3_600_000;
      for (const [id, libres] of snap) {
        minute.push({ ts: nowMs, id, libres });
        const k = `${id}|${hourTs}`;
        const a = hourAgg.get(k) ?? {
          how: madridHourOfWeek(hourTs + 1_800_000),
          sum: 0,
          n: 0,
          min: Infinity,
          max: -Infinity,
          hourTs,
        };
        a.sum += libres;
        a.n++;
        a.min = Math.min(a.min, libres);
        a.max = Math.max(a.max, libres);
        hourAgg.set(k, a);
      }
      const cutoff = nowMs - 30 * 24 * 3_600_000;
      while (minute.length && minute[0].ts < cutoff) minute.shift();
    },
    recordParkEvent(e) {
      parkEvents.push(e);
    },
    hourlyBaseline(id, how) {
      let sum = 0;
      let n = 0;
      // per-hour aggregates keyed `${id}|${hourTs}` — mean of hourly means
      for (const [k, a] of hourAgg) {
        if (k.startsWith(`${id}|`) && a.how === how) {
          sum += a.sum / a.n;
          n++;
        }
      }
      return n > 0 ? sum / n : null;
    },
    historyDepthDays() {
      let lo = Infinity;
      let hi = -Infinity;
      for (const a of hourAgg.values()) {
        lo = Math.min(lo, a.hourTs);
        hi = Math.max(hi, a.hourTs);
      }
      return hi > lo ? (hi - lo) / (24 * 3_600_000) : 0;
    },
    parkEventCount(lat, lon, radiusKm) {
      return parkEvents.filter((e) => haversineKm(lat, lon, e.lat, e.lon) <= radiusKm).length;
    },
    replaceSignals(source, rows, nowMs) {
      signals.set(source, rows);
      lastPoll.set(source, nowMs);
    },
    signals: (source) => signals.get(source) ?? [],
    signalLastPollMs: (source) => lastPoll.get(source) ?? 0,
    signalStats: () =>
      [...signals.keys()].map((s) => ({
        source: s,
        rows: signals.get(s)?.length ?? 0,
        lastPollMs: lastPoll.get(s) ?? 0,
      })),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function slopePerMin(samples: { ts: number; libres: number }[], nowMs: number): number | null {
  const pts = samples.filter((s) => nowMs - s.ts <= VELOCITY_WINDOW_MS);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => (p.ts - pts[0].ts) / 60_000);
  const ys = pts.map((p) => p.libres);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

function pointInPolygon(lat: number, lon: number, coords: number[][][]): boolean {
  const ringPts = coords[0];
  let inside = false;
  let j = ringPts.length - 1;
  for (let i = 0; i < ringPts.length; i++) {
    const [xi, yi] = [ringPts[i][0], ringPts[i][1]];
    const [xj, yj] = [ringPts[j][0], ringPts[j][1]];
    if (yi > lat !== yj > lat) {
      const xInt = ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (lon < xInt) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function findZone(lat: number, lon: number): (typeof ZONES.features)[number] | null {
  for (const feat of ZONES.features) {
    const geom = feat.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon" && pointInPolygon(lat, lon, geom.coordinates as number[][][])) {
      return feat;
    }
    if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as number[][][][]) {
        if (pointInPolygon(lat, lon, poly)) return feat;
      }
    }
  }
  return null;
}

function madridParts(): { weekday: number; minutes: number; iso: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const hour = Number(get("hour")) % 24;
  const minutes = hour * 60 + Number(get("minute"));
  const iso = `${get("year")}-${get("month")}-${get("day")}T${String(hour).padStart(2, "0")}:${get("minute")}:00`;
  return { weekday, minutes, iso };
}

function sareEnforcedNow(): boolean {
  const { weekday, minutes } = madridParts();
  if (weekday >= 1 && weekday <= 5) {
    return (minutes >= 9 * 60 && minutes < 14 * 60) || (minutes >= 16 * 60 && minutes < 20 * 60);
  }
  if (weekday === 6) return minutes >= 9 * 60 && minutes < 14 * 60;
  return false;
}

// ── App factory ──────────────────────────────────────────────────────────────

export function createApiApp(state: FeedState, history?: HistoryStore): Hono {
  const app = new Hono();
  app.use("*", cors({ origin: "*" }));
  app.onError((err, c) => c.json({ error: String(err) }, 500));

  app.get("/v1/health", (c) => {
    const now = Date.now();
    return c.json({
      ok: state.lastGoodPollMs !== null && now - state.lastGoodPollMs < 5 * POLL_INTERVAL_MS,
      feedAgeS: state.lastGoodPollMs ? Math.round((now - state.lastGoodPollMs) / 100) / 10 : -1,
      observations: state.observationsTotal,
      uptimeS: Math.round((now - state.startMs) / 100) / 10,
      historyDays: history?.historyDepthDays() ?? 0,
    });
  });

  app.get("/v1/facilities", (c) => {
    const now = Date.now();
    const perId = new Map<string, { ts: number; libres: number }[]>();
    for (const s of state.ring) {
      const list = perId.get(s.id) ?? [];
      list.push(s);
      perId.set(s.id, list);
    }
    const ids = new Set([...CATALOG.keys(), ...perId.keys()]);
    const facilities = [...ids].sort().map((fid) => {
      const cat = CATALOG.get(fid);
      const samples = perId.get(fid) ?? [];
      const available = state.lastPollSnapshot.get(fid) ?? null;
      let capacity = state.observedMax.get(fid) ?? null;
      if (capacity !== null && available !== null) capacity = Math.max(capacity, available);
      const v = samples.length >= 2 ? slopePerMin(samples, now) : null;
      const projected =
        available === null
          ? []
          : [5, 10, 15, 20].map((m) =>
              Math.round(Math.min(Math.max(available + (v ?? 0) * m, 0), capacity ?? Infinity)),
            );
      const seen = state.perIdLastSeen.get(fid);
      return {
        id: fid,
        name: cat?.name ?? fid,
        lat: cat?.lat ?? 0,
        lon: cat?.lon ?? 0,
        kind: "garage",
        capacity,
        available,
        velocityPerMin: v === null ? null : Math.round(v * 1000) / 1000,
        projected,
        dataAgeS: seen ? Math.round((now - seen) / 100) / 10 : -1,
      };
    });
    return c.json({ city: "malaga", generatedAt: madridParts().iso, facilities });
  });

  app.get("/v1/zones.geojson", (c) => c.json(ZONES));

  app.get("/v1/rules", (c) => {
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    const source = "SARE zones dataset, baked 2026-10-07";
    const feat = Number.isFinite(lat) && Number.isFinite(lon) ? findZone(lat, lon) : null;
    if (!feat) {
      return c.json({
        verdict: "unknown",
        zoneType: null,
        detail: "Outside all mapped SARE zones — check on-street signage.",
        confidence: "inferred",
        source,
      });
    }
    const props = (feat.properties ?? {}) as Record<string, string | number | undefined>;
    const ztype = String(props.type ?? "unknown");
    const name = String(props.name ?? "this zone");
    let verdict: string;
    let detail: string;
    if (ztype === "loading" || ztype === "resident") {
      verdict = "restricted";
      detail = `${name}: ${ztype} zone — restricted, do not park without a permit.`;
    } else if (ztype === "sare_blue" || ztype === "sare_green") {
      const zona = ztype === "sare_blue" ? "zona azul" : "zona verde";
      if (sareEnforcedNow()) {
        verdict = "paid";
        detail = `${name}: SARE ${zona} — paid now (${props.hours}), max ${props.maxStayMin} min.`;
      } else {
        verdict = "legal";
        detail = `${name}: SARE ${zona} — free now (paid ${props.hours}).`;
      }
    } else if (ztype === "free") {
      verdict = "legal";
      detail = `${name}: free parking area — no SARE regime.`;
    } else {
      verdict = "unknown";
      detail = `${name}: unclassified zone — check on-street signage.`;
    }
    return c.json({ verdict, zoneType: ztype, detail, confidence: "inferred", source });
  });

  app.get("/v1/eta", async (c) => {
    const fromLat = Number(c.req.query("from_lat"));
    const fromLon = Number(c.req.query("from_lon"));
    const toLat = Number(c.req.query("to_lat"));
    const toLon = Number(c.req.query("to_lon"));
    const dist = haversineKm(fromLat, fromLon, toLat, toLon);
    const walkMin = ((dist * 1.3) / 5.0) * 60;
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`,
        { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5_000) },
      );
      if (res.ok) {
        const route = ((await res.json()) as { routes?: { duration?: number }[] }).routes?.[0];
        if (route?.duration != null) {
          return c.json({
            driveMin: Math.round((route.duration / 60) * 10) / 10,
            walkMin: Math.round(walkMin * 10) / 10,
            source: "osrm",
          });
        }
      }
    } catch (err) {
      console.info("[karro-api] OSRM unavailable, distance estimate:", err);
    }
    return c.json({
      driveMin: Math.round((dist / 25) * 60 * 10) / 10,
      walkMin: Math.round(walkMin * 10) / 10,
      source: "estimate",
    });
  });

  // Nominatim: serial requests, ≥1s spacing, 60s per-query cache
  const geocodeCache = new Map<string, { ts: number; results: unknown[] }>();
  let geocodeChain: Promise<void> = Promise.resolve();
  let geocodeLastMs = 0;

  app.get("/v1/geocode", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ error: "missing q" }, 400);
    const key = q.toLowerCase();
    const cached = geocodeCache.get(key);
    if (cached && Date.now() - cached.ts < GEOCODE_CACHE_MS) {
      return c.json({ results: cached.results });
    }
    let results: unknown[] | null = null;
    let err: unknown = null;
    geocodeChain = geocodeChain.then(async () => {
      const wait = 1_000 - (Date.now() - geocodeLastMs);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const params = new URLSearchParams({
        format: "json",
        q: `${q}, Málaga`,
        viewbox: "-4.55,36.82,-4.30,36.65",
        bounded: "1",
        limit: "5",
      });
      try {
        const res = await fetch(`${NOMINATIM_URL}?${params}`, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(10_000),
        });
        geocodeLastMs = Date.now();
        if (!res.ok) throw new Error(`nominatim ${res.status}`);
        results = ((await res.json()) as { display_name: string; lat: string; lon: string }[]).map(
          (r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }),
        );
        geocodeCache.set(key, { ts: Date.now(), results });
      } catch (e) {
        geocodeLastMs = Date.now();
        err = e;
      }
    });
    await geocodeChain;
    if (err) return c.json({ error: `geocoder unavailable: ${String(err)}` }, 502);
    return c.json({ results: results ?? [] });
  });

  app.get("/v1/forecast/:city/:date", (c) => {
    const { city, date } = c.req.param();
    if (city.toLowerCase() !== "malaga") {
      return c.json({ error: "only city=malaga is supported" }, 404);
    }
    const now = Date.now();
    const totalCap = [...state.observedMax.values()].reduce((a, b) => a + b, 0);
    const totalNow = [...state.lastPollSnapshot.values()].reduce((a, b) => a + b, 0);
    const perId = new Map<string, { ts: number; libres: number }[]>();
    for (const s of state.ring) {
      const list = perId.get(s.id) ?? [];
      list.push(s);
      perId.set(s.id, list);
    }
    let projectedMin = 0;
    for (const [fid, samples] of perId) {
      const avail = state.lastPollSnapshot.get(fid);
      if (avail == null) continue;
      const v = slopePerMin(samples, now) ?? 0;
      const cap = state.observedMax.get(fid) ?? avail;
      projectedMin += Math.trunc(Math.min(Math.max(avail + v * 20, 0), cap));
    }
    let verdict: "EASY" | "MEDIUM" | "HARD";
    let detail: string;
    if (totalCap <= 0) {
      verdict = "MEDIUM";
      detail = "Live SMASSA feed unavailable — no reliable forecast; check again shortly.";
    } else {
      // Blend the 20-min velocity projection with the seasonal (same
      // hour-of-week) baseline once history accrues — recent trend leads,
      // seasonal stabilizes: weight capped at 0.5 and ramps over ~3 weeks.
      const depthDays = history?.historyDepthDays() ?? 0;
      const how = madridHourOfWeek(now);
      let seasonalSum = 0;
      let seasonalN = 0;
      if (history) {
        for (const fid of perId.keys()) {
          const b = history.hourlyBaseline(fid, how);
          if (b !== null) {
            seasonalSum += b;
            seasonalN++;
          }
        }
      }
      const blended =
        seasonalN > 0 && depthDays > 0
          ? Math.round(
              projectedMin * (1 - Math.min(0.5, depthDays / 42)) +
                seasonalSum * Math.min(0.5, depthDays / 42),
            )
          : projectedMin;
      const ratio = blended / totalCap;
      verdict = ratio > 0.15 ? "EASY" : ratio < 0.05 ? "HARD" : "MEDIUM";
      const basis =
        seasonalN > 0
          ? ` (~${blended} blended with ${Math.round(depthDays)}d same-hour history)`
          : "";
      detail = `${state.lastPollSnapshot.size} garages reporting: ~${totalNow} free now, ~${blended} projected in 20 min (${Math.round(ratio * 100)}% of capacity)${basis}.`;
    }
    let arriveBy: string | null = null;
    if (verdict !== "EASY") {
      const { minutes } = madridParts();
      const next = Math.ceil(minutes / 30) * 30;
      arriveBy = `${String(Math.floor((next / 60) % 24)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
    }
    return c.json({
      city: "malaga",
      date,
      generatedAt: madridParts().iso,
      verdict,
      arriveBy,
      detail,
    });
  });

  // Street-parking telemetry: user park/depart reports. These accumulate
  // into the street-forecast model — the data moat starts here.
  app.post("/v1/observations", async (c) => {
    if (!history) return c.json({ error: "history not enabled" }, 501);
    const body = (await c.req.json().catch(() => null)) as {
      kind?: string;
      lat?: number;
      lon?: number;
      ts?: number;
      clientId?: string;
    } | null;
    if (
      !body ||
      (body.kind !== "park" && body.kind !== "depart") ||
      !Number.isFinite(body.lat) ||
      !Number.isFinite(body.lon)
    ) {
      return c.json({ error: "expected {kind: 'park'|'depart', lat, lon}" }, 400);
    }
    history.recordParkEvent({
      ts: Number.isFinite(body.ts) ? Number(body.ts) : Date.now(),
      kind: body.kind,
      lat: Number(body.lat),
      lon: Number(body.lon),
      clientId: typeof body.clientId === "string" ? body.clientId.slice(0, 64) : undefined,
    });
    return c.json({ ok: true }, 202);
  });

  // Optimistic street-level forecast for a point: difficulty + confidence.
  // Cold start is a feature, not an error — "collecting" tells the user the
  // model is filling in, matching the speculative-response UX.
  // Part B: external signals (weather / holidays / roadworks) adjust the
  // garage-seasonal base difficulty, and the containing SARE zone's curb
  // capacity scales the roadwork penalty.
  app.get("/v1/signals", (c) => {
    return c.json({
      generatedAt: madridParts().iso,
      sources: history?.signalStats?.() ?? [],
    });
  });

  app.get("/v1/street-forecast", (c) => {
    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    const at = Number(c.req.query("at")) || Date.now();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return c.json({ error: "missing lat/lon" }, 400);
    }
    const depthDays = history?.historyDepthDays() ?? 0;
    const events = history?.parkEventCount(lat, lon, 0.5) ?? 0;
    const how = madridHourOfWeek(at);

    // Area-pressure proxy: seasonal baseline of the 3 nearest garages,
    // expressed as free-capacity ratio — street pressure tracks it.
    const byDist = [...CATALOG.values()]
      .map((g) => ({ g, d: haversineKm(lat, lon, g.lat, g.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    let ratioSum = 0;
    let ratioN = 0;
    if (history) {
      for (const { g } of byDist) {
        const base = history.hourlyBaseline(g.id, how);
        const cap = state.observedMax.get(g.id);
        if (base !== null && cap && cap > 0) {
          ratioSum += base / cap;
          ratioN++;
        }
      }
    }

    // ── External signals ────────────────────────────────────────────────
    // bump shifts the EASY→MEDIUM→HARD ladder; signals[] explains why.
    const signals: string[] = [];
    let bump = 0;

    // Weather: rain pushes demand from curb to covered parking and slows
    // turnover — one level harder when the forecast hour is wet.
    const wxRows = history?.signals?.("openmeteo") ?? [];
    const wx = wxRows.find(
      (r) => r.fromMs !== undefined && at >= r.fromMs && at < (r.toMs ?? r.fromMs + 3_600_000),
    );
    if (wx && (wx.valueNum ?? 0) >= 60) {
      const rainMm = wx.valueJson
        ? ((JSON.parse(wx.valueJson) as { rainMm?: number }).rainMm ?? 0)
        : 0;
      bump += rainMm >= 1 ? 2 : 1;
      signals.push(`rain likely at that hour (${wx.valueNum}%, ${rainMm} mm)`);
    } else if (wx && (wx.valueNum ?? 0) >= 35) {
      signals.push(`possible rain at that hour (${wx.valueNum}%)`);
    }

    // Holidays: SARE enforcement is off (L-V / S-D-F tariff split), so more
    // curb is free-to-use — one level easier, flagged in the detail.
    const holRows = history?.signals?.("holidays") ?? [];
    const hol = holRows.find((r) => r.key === madridDayKey(at));
    if (hol) {
      bump -= 1;
      const name = hol.valueJson
        ? ((JSON.parse(hol.valueJson) as { name?: string }).name ?? "public holiday")
        : "public holiday";
      signals.push(`${name} — SARE not enforced, free curb`);
    }

    // Roadworks: cortes within 300 m eat curb capacity. Weighted by
    // TIPOAFECTACION (parking occupation counts double) and damped by the
    // containing SARE sector's known curb supply.
    const cortesRows = history?.signals?.("cortes") ?? [];
    const zone = Number.isFinite(lat) ? findZone(lat, lon) : null;
    const zoneName = String(zone?.properties?.name ?? "");
    const curbSpaces = SECTOR_SPACES[zoneName.toUpperCase()] ?? null;
    let activeCortes = 0;
    let corteWeight = 0;
    for (const r of cortesRows) {
      if (r.fromMs !== undefined && at < r.fromMs) continue;
      if (r.toMs !== undefined && at > r.toMs) continue;
      const j = r.valueJson ? (JSON.parse(r.valueJson) as { lat?: number; lon?: number }) : null;
      if (j?.lat == null || j?.lon == null) continue;
      if (haversineKm(lat, lon, j.lat, j.lon) <= 0.3) {
        activeCortes++;
        corteWeight += r.valueNum ?? 1;
      }
    }
    if (activeCortes > 0) {
      const damp = curbSpaces !== null && curbSpaces > 400 ? 0.5 : 1;
      const eff = corteWeight * damp;
      bump += eff >= 3 ? 2 : 1;
      signals.push(`${activeCortes} active roadwork${activeCortes === 1 ? "" : "s"} within 300 m`);
    }

    if (ratioN === 0 && events === 0) {
      return c.json({
        difficulty: "unknown",
        confidence: "cold",
        events,
        historyDays: depthDays,
        curbSpaces,
        activeCortes,
        signals,
        detail:
          "collecting live data for this area — predictions sharpen as coverage builds" +
          (signals.length ? ` (${signals.join("; ")})` : ""),
      });
    }
    const areaRatio = ratioN > 0 ? ratioSum / ratioN : 0.15;
    const LADDER = ["EASY", "MEDIUM", "HARD"] as const;
    const base = areaRatio > 0.15 ? 0 : areaRatio < 0.05 ? 2 : 1;
    const difficulty = LADDER[Math.min(2, Math.max(0, base + bump))];
    const confidence = depthDays < 7 ? "cold" : events > 0 ? "warm" : "cold";
    const basis =
      ratioN > 0
        ? `${ratioN} garage seasonal baselines${events ? ` + ${events} street reports` : ""}`
        : `${events} street reports`;
    return c.json({
      difficulty,
      confidence,
      events,
      historyDays: Math.round(depthDays * 10) / 10,
      curbSpaces,
      activeCortes,
      signals,
      detail:
        `${basis} — ${difficulty.toLowerCase()} near destination at this hour` +
        (signals.length ? ` (${signals.join("; ")})` : ""),
    });
  });

  app.get("/v1/observations", (c) =>
    c.json({
      generatedAt: madridParts().iso,
      count: state.ring.length,
      samples: state.ring
        .slice(-500)
        .map((s) => ({ ts: Math.round(s.ts / 100) / 10, id: s.id, libres: s.libres })),
    }),
  );

  return app;
}
