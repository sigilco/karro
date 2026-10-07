import * as v from 'valibot'

// ── Wire schemas shared between the API shim and the app client ───────────
// These ARE the API contract — change only by editing this file (parent owns it).

export const Facility = v.object({
  id: v.string(),
  name: v.string(),
  lat: v.number(),
  lon: v.number(),
  kind: v.picklist(['garage', 'lot', 'free_area', 'street_metered']),
  capacity: v.nullable(v.number()),
  available: v.nullable(v.number()),
  // velocity: spots/min over the shim's rolling window; negative = filling
  velocityPerMin: v.nullable(v.number()),
  // projected free spaces at +5/+10/+15/+20 min
  projected: v.array(v.number()),
  pmrSpaces: v.optional(v.number()),
  priceEurPerHour: v.optional(v.number()),
  dataAgeS: v.number(),
})
export type Facility = v.InferOutput<typeof Facility>

export const FacilitiesResponse = v.object({
  city: v.string(),
  generatedAt: v.string(),
  facilities: v.array(Facility),
})
export type FacilitiesResponse = v.InferOutput<typeof FacilitiesResponse>

export const ZoneRegime = v.object({
  type: v.string(), // 'sare_blue' | 'sare_green' | 'free' | 'loading' | 'resident' …
  hours: v.nullable(v.string()), // human summary, e.g. 'Mon–Fri 9–14 & 16–20, Sat 9–14'
  priceEurPerHour: v.nullable(v.number()),
  maxStayMin: v.nullable(v.number()),
  zbe: v.boolean(),
})
export type ZoneRegime = v.InferOutput<typeof ZoneRegime>

export const RulesVerdict = v.object({
  verdict: v.picklist(['legal', 'paid', 'restricted', 'unknown']),
  zoneType: v.nullable(v.string()),
  detail: v.string(), // "SARE zona azul — paid until 20:00, max 2h"
  confidence: v.picklist(['verified', 'crowd', 'inferred']),
  source: v.string(),
})
export type RulesVerdict = v.InferOutput<typeof RulesVerdict>

export const HealthResponse = v.object({
  ok: v.boolean(),
  feedAgeS: v.number(),
  observations: v.number(),
  uptimeS: v.number(),
})
export type HealthResponse = v.InferOutput<typeof HealthResponse>

export const Forecast = v.object({
  city: v.string(),
  date: v.string(),
  generatedAt: v.string(),
  verdict: v.picklist(['EASY', 'MEDIUM', 'HARD']),
  arriveBy: v.nullable(v.string()),
  detail: v.string(),
})
export type Forecast = v.InferOutput<typeof Forecast>

// zones.geojson is served as a FeatureCollection; each feature's properties:
export interface ZoneProperties extends ZoneRegime {
  name?: string
}
