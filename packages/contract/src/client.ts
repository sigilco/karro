import * as v from "valibot";
import {
  EtaResponse,
  FacilitiesResponse,
  Forecast,
  GeocodeResponse,
  HealthResponse,
  RulesVerdict,
  StreetForecast,
} from "./index";

// API base resolution order:
// 1. `?api=<url>` query param (persists to localStorage) — lets the shim URL
//    be attached to a deployed static build after the fact.
// 2. localStorage.karro_api (sticky from a previous ?api= visit)
// 3. ONE_PUBLIC_API_URL baked at build time
// 4. '' (same origin)
function resolveBase(): string {
  if (typeof window === "undefined") return "";
  const param = new URLSearchParams(window.location.search).get("api");
  if (param) {
    const clean = param.replace(/\/$/, "");
    window.localStorage.setItem("karro_api", clean);
    return clean;
  }
  return window.localStorage.getItem("karro_api") ?? "";
}

const BASE =
  resolveBase() ||
  (import.meta as unknown as { env: Record<string, string | undefined> }).env?.ONE_PUBLIC_API_URL ||
  "";

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
  // fire-and-forget park/depart telemetry; never throws into the UI
  postObservation: (kind: "park" | "depart", lat: number, lon: number, clientId?: string) =>
    fetch(`${BASE}/v1/observations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, lat, lon, ts: Date.now(), clientId }),
    }).catch(() => undefined),
};
