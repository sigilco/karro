import * as v from "valibot";
import {
  EtaResponse,
  FacilitiesResponse,
  Forecast,
  GeocodeResponse,
  HealthResponse,
  RulesVerdict,
  SignalsResponse,
  StreetForecast,
} from "./index";
import type { IntentPayload } from "./index";

// API base resolution order:
// 1. `?api=<url>` query param (persists to localStorage) — lets the shim URL
//    be attached to a deployed static build after the fact.
// 2. localStorage.karro_api (sticky from a previous ?api= visit)
// 3. ONE_PUBLIC_API_URL baked at build time
// 4. '' (same origin)
function resolveBase(): string {
  // localStorage can be missing (SSR), undefined (RN Hermes), or null
  // (android WebView without domStorageEnabled) — any access may throw,
  // so wrap rather than typeof-guard. Falls through to the baked base.
  try {
    const param = new URLSearchParams(window.location.search).get("api");
    if (param) {
      const clean = param.replace(/\/$/, "");
      localStorage.setItem("karro_api", clean);
      return clean;
    }
    return localStorage.getItem("karro_api") ?? "";
  } catch {
    return "";
  }
}

// NOTE: must be a literal `import.meta.env.KEY` access — the metro
// import-meta-env babel plugin only rewrites that form (no casts, no `?.`),
// and native builds get their API base baked in through it.
const BASE = resolveBase() || import.meta.env.ONE_PUBLIC_API_URL || "";

async function getJson<T>(path: string, schema: v.GenericSchema<T>): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return v.parse(schema, await res.json());
}

export const api = {
  facilities: () => getJson("/v1/facilities", FacilitiesResponse),
  health: () => getJson("/v1/health", HealthResponse),
  rules: (lat: number, lon: number) => getJson(`/v1/rules?lat=${lat}&lon=${lon}`, RulesVerdict),
  forecast: (city: string, date: string) => getJson(`/v1/forecast/${city}/${date}`, Forecast),
  eta: (fromLat: number, fromLon: number, toLat: number, toLon: number) =>
    getJson(
      `/v1/eta?from_lat=${fromLat}&from_lon=${fromLon}&to_lat=${toLat}&to_lon=${toLon}`,
      EtaResponse,
    ),
  geocode: (q: string) => getJson(`/v1/geocode?q=${encodeURIComponent(q)}`, GeocodeResponse),
  zonesGeoJson: () => fetch(`${BASE}/v1/zones.geojson`).then((r) => r.json()),
  streetForecast: (lat: number, lon: number, at?: number) =>
    getJson(`/v1/street-forecast?lat=${lat}&lon=${lon}${at ? `&at=${at}` : ""}`, StreetForecast),
  signals: () => getJson("/v1/signals", SignalsResponse),
  // fire-and-forget park/depart telemetry; never throws into the UI
  postObservation: (kind: "park" | "depart", lat: number, lon: number, clientId?: string) =>
    fetch(`${BASE}/v1/observations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, lat, lon, ts: Date.now(), clientId }),
    }).catch(() => undefined),
  // landing-page "bring Karro to my city" vote; throws on non-2xx so the
  // form can show its retry state
  postIntent: async (payload: IntentPayload) => {
    const res = await fetch(`${BASE}/v1/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`/v1/intent → ${res.status}`);
  },
};
