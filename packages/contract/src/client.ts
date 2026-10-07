import * as v from 'valibot'
import {
  FacilitiesResponse,
  Forecast,
  HealthResponse,
  RulesVerdict,
} from './index'

// API base: set ONE_PUBLIC_API_URL at build/runtime; same-origin '' in dev.
const BASE = (globalThis as { __KARRO_API__?: string }).__KARRO_API__ ??
  (import.meta as unknown as { env: Record<string, string | undefined> }).env
    ?.ONE_PUBLIC_API_URL ??
  ''

async function getJson<T>(path: string, schema: v.GenericSchema<T>): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return v.parse(schema, await res.json())
}

export const api = {
  facilities: () => getJson('/v1/facilities', FacilitiesResponse),
  health: () => getJson('/v1/health', HealthResponse),
  rules: (lat: number, lon: number) =>
    getJson(`/v1/rules?lat=${lat}&lon=${lon}`, RulesVerdict),
  forecast: (city: string, date: string) =>
    getJson(`/v1/forecast/${city}/${date}`, Forecast),
  zonesGeoJson: () => fetch(`${BASE}/v1/zones.geojson`).then((r) => r.json()),
}
