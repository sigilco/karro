// Cloudflare Workers entry — all /v1 state lives in a single Durable Object
// (the 30-min velocity ring needs one consistent writer). A 1-minute cron
// trigger hits the DO's internal poll endpoint, matching the node server's
// setInterval cadence. State is persisted to DO storage after each poll so
// hibernation doesn't lose observation history.

/// <reference types="@cloudflare/workers-types" />

import {
  createApiApp,
  createFeedState,
  madridHourOfWeek,
  pollOnce,
  restoreState,
  serializeState,
} from "./core";
import type { FeedState as ApiState, HistoryStore } from "./core";

interface Env {
  FEED: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const SINGLETON = "malaga";
const ONE_HOUR = 3_600_000;
const OBS_MINUTE_TTL_MS = 30 * 24 * ONE_HOUR; // raw rows 30d, obs_hour forever

// Long-horizon history on the DO's own SQLite storage — no extra binding.
// obs_minute accumulates every poll (12 garages/min, ~6M rows/yr, pruned to
// 30d); obs_hour keeps hour-of-week aggregates forever for seasonal
// predictions; park_events is user street-parking telemetry.
class SqlHistory implements HistoryStore {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS obs_minute (ts INTEGER NOT NULL, id TEXT NOT NULL, libres INTEGER NOT NULL)",
    );
    sql.exec("CREATE INDEX IF NOT EXISTS obs_minute_ts ON obs_minute(ts)");
    sql.exec(
      `CREATE TABLE IF NOT EXISTS obs_hour (
        hour_ts INTEGER NOT NULL, how INTEGER NOT NULL, id TEXT NOT NULL,
        avg_libres REAL NOT NULL, min_libres INTEGER NOT NULL,
        max_libres INTEGER NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (hour_ts, id)
      )`,
    );
    sql.exec("CREATE INDEX IF NOT EXISTS obs_hour_how ON obs_hour(id, how)");
    sql.exec(
      `CREATE TABLE IF NOT EXISTS park_events (
        ts INTEGER NOT NULL, kind TEXT NOT NULL,
        lat REAL NOT NULL, lon REAL NOT NULL, client_id TEXT
      )`,
    );
    sql.exec("CREATE INDEX IF NOT EXISTS park_events_ts ON park_events(ts)");
    sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)");
  }

  private metaGet(k: string): number {
    return Number(this.sql.exec("SELECT v FROM meta WHERE k = ?", k).one()?.v ?? 0);
  }

  private metaSet(k: string, v: number): void {
    this.sql.exec(
      "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?",
      k,
      v,
      v,
    );
  }

  recordPoll(nowMs: number, snap: ReadonlyMap<string, number>): void {
    for (const [id, libres] of snap) {
      this.sql.exec("INSERT INTO obs_minute (ts, id, libres) VALUES (?, ?, ?)", nowMs, id, libres);
    }
    this.rollup(nowMs);
    if (nowMs - this.metaGet("lastPrune") > 7 * 24 * ONE_HOUR) {
      this.sql.exec("DELETE FROM obs_minute WHERE ts < ?", nowMs - OBS_MINUTE_TTL_MS);
      this.metaSet("lastPrune", nowMs);
    }
  }

  private rollup(nowMs: number): void {
    const first = this.sql.exec("SELECT MIN(ts) t FROM obs_minute").one()?.t as number | undefined;
    if (!first) return;
    const lastClosed = Math.floor(nowMs / ONE_HOUR) * ONE_HOUR - ONE_HOUR;
    let cur = Math.max(
      Math.floor(Number(first) / ONE_HOUR) * ONE_HOUR,
      this.metaGet("lastRollup") + ONE_HOUR || 0,
    );
    while (cur <= lastClosed) {
      this.sql.exec(
        `INSERT OR REPLACE INTO obs_hour (hour_ts, how, id, avg_libres, min_libres, max_libres, n)
         SELECT ?, ?, id, AVG(libres), MIN(libres), MAX(libres), COUNT(*)
         FROM obs_minute WHERE ts >= ? AND ts < ? GROUP BY id`,
        cur,
        madridHourOfWeek(cur + ONE_HOUR / 2),
        cur,
        cur + ONE_HOUR,
      );
      cur += ONE_HOUR;
    }
    if (cur > this.metaGet("lastRollup")) this.metaSet("lastRollup", cur - ONE_HOUR);
  }

  hourlyBaseline(id: string, how: number): number | null {
    const row = this.sql
      .exec("SELECT AVG(avg_libres) a, COUNT(*) n FROM obs_hour WHERE id = ? AND how = ?", id, how)
      .one();
    return row && Number(row.n) > 0 ? Number(row.a) : null;
  }

  historyDepthDays(): number {
    const row = this.sql.exec("SELECT MIN(hour_ts) lo, MAX(hour_ts) hi FROM obs_hour").one();
    if (!row?.lo || !row?.hi) return 0;
    return (Number(row.hi) - Number(row.lo)) / (24 * ONE_HOUR);
  }

  parkEventCount(lat: number, lon: number, radiusKm: number): number {
    const dLat = radiusKm / 111;
    const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
    const row = this.sql
      .exec(
        `SELECT COUNT(*) n FROM park_events
         WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
        lat - dLat,
        lat + dLat,
        lon - dLon,
        lon + dLon,
      )
      .one();
    return Number(row?.n ?? 0);
  }

  recordParkEvent(e: {
    ts: number;
    kind: "park" | "depart";
    lat: number;
    lon: number;
    clientId?: string;
  }): void {
    this.sql.exec(
      "INSERT INTO park_events (ts, kind, lat, lon, client_id) VALUES (?, ?, ?, ?, ?)",
      e.ts,
      e.kind,
      e.lat,
      e.lon,
      e.clientId ?? null,
    );
  }
}

export class FeedDO implements DurableObject {
  private state: ApiState = createFeedState();
  private app: ReturnType<typeof createApiApp>;
  private history: SqlHistory;

  constructor(
    private ctx: DurableObjectState,
    _env: Env,
  ) {
    this.history = new SqlHistory(ctx.storage.sql);
    this.app = createApiApp(this.state, this.history);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<string>("feedState");
      if (!stored) return;
      // Restore into the SAME object the app captured.
      const r = restoreState(stored);
      this.state.startMs = r.startMs;
      this.state.ring = r.ring;
      this.state.lastGoodPollMs = r.lastGoodPollMs;
      this.state.lastPollSnapshot = r.lastPollSnapshot;
      this.state.observedMax = r.observedMax;
      this.state.perIdLastSeen = r.perIdLastSeen;
      this.state.observationsTotal = r.observationsTotal;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1/internal/poll") {
      try {
        await pollOnce(this.state, this.history);
        this.ctx.storage.put("feedState", serializeState(this.state));
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json({ ok: false, error: String(err) }, { status: 502 });
      }
    }
    return this.app.fetch(request);
  }
}

// Pretty-path routing for the emitted per-route .html files (/dest -> /dest.html).
function assetPath(pathname: string): string {
  if (pathname === "/" || pathname === "") return "/index.html";
  if (pathname.includes(".")) return pathname;
  return `${pathname.replace(/\/$/, "")}.html`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/v1/")) {
      const stub = env.FEED.get(env.FEED.idFromName(SINGLETON));
      return stub.fetch(request);
    }
    const assetUrl = new URL(assetPath(url.pathname), url.origin);
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (res.status === 404) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
    }
    return res;
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.FEED.get(env.FEED.idFromName(SINGLETON));
    ctx.waitUntil(stub.fetch("https://do.internal/v1/internal/poll"));
  },
} satisfies ExportedHandler<Env>;
