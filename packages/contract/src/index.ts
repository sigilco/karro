import * as v from "valibot";

// ── Wire schemas shared between the API shim and the app client ───────────
// These ARE the API contract — change only by editing this file (parent owns it).

export const Facility = v.object({
  id: v.string(),
  name: v.string(),
  lat: v.number(),
  lon: v.number(),
  kind: v.picklist(["garage", "lot", "free_area", "street_metered"]),
  capacity: v.nullable(v.number()),
  available: v.nullable(v.number()),
  // velocity: spots/min over the shim's rolling window; negative = filling
  velocityPerMin: v.nullable(v.number()),
  // projected free spaces at +5/+10/+15/+20 min
  projected: v.array(v.number()),
  pmrSpaces: v.optional(v.number()),
  priceEurPerHour: v.optional(v.number()),
  dataAgeS: v.number(),
});
export type Facility = v.InferOutput<typeof Facility>;

export const FacilitiesResponse = v.object({
  city: v.string(),
  generatedAt: v.string(),
  facilities: v.array(Facility),
});
export type FacilitiesResponse = v.InferOutput<typeof FacilitiesResponse>;

export const ZoneRegime = v.object({
  type: v.string(), // 'sare_blue' | 'sare_green' | 'free' | 'loading' | 'resident' …
  hours: v.nullable(v.string()), // human summary, e.g. 'Mon–Fri 9–14 & 16–20, Sat 9–14'
  priceEurPerHour: v.nullable(v.number()),
  maxStayMin: v.nullable(v.number()),
  zbe: v.boolean(),
});
export type ZoneRegime = v.InferOutput<typeof ZoneRegime>;

export const RulesVerdict = v.object({
  verdict: v.picklist(["legal", "paid", "restricted", "unknown"]),
  zoneType: v.nullable(v.string()),
  detail: v.string(), // "SARE zona azul — paid until 20:00, max 2h"
  confidence: v.picklist(["verified", "crowd", "inferred"]),
  source: v.string(),
});
export type RulesVerdict = v.InferOutput<typeof RulesVerdict>;

export const EtaResponse = v.object({
  driveMin: v.number(),
  walkMin: v.number(),
  source: v.picklist(["osrm", "estimate"]),
});
export type EtaResponse = v.InferOutput<typeof EtaResponse>;

export const GeocodeResponse = v.object({
  results: v.array(
    v.object({
      name: v.string(),
      lat: v.number(),
      lon: v.number(),
    }),
  ),
});
export type GeocodeResponse = v.InferOutput<typeof GeocodeResponse>;

export const HealthResponse = v.object({
  ok: v.boolean(),
  feedAgeS: v.number(),
  observations: v.number(),
  uptimeS: v.number(),
  historyDays: v.optional(v.number()),
});
export type HealthResponse = v.InferOutput<typeof HealthResponse>;

// Street-level forecast — optimistic: 'unknown/cold' means the model is
// still collecting, so UI shows "gathering live data" rather than an error.
// Optional signal fields describe external-source adjustments (weather,
// holidays, roadworks) folded into difficulty — present when the API's
// connectors have data.
export const StreetForecast = v.object({
  difficulty: v.picklist(["EASY", "MEDIUM", "HARD", "unknown"]),
  confidence: v.picklist(["cold", "warm"]),
  events: v.number(),
  historyDays: v.number(),
  detail: v.string(),
  // SARE curb spaces in the containing zone (null outside mapped zones)
  curbSpaces: v.optional(v.nullable(v.number())),
  // active roadworks/closures within 300 m at `at`
  activeCortes: v.optional(v.nullable(v.number())),
  // human-readable adjustments applied, e.g. "rain likely at that hour (72%, 1.2 mm)"
  signals: v.optional(v.array(v.string())),
});
export type StreetForecast = v.InferOutput<typeof StreetForecast>;

// /v1/signals — connector status for ops/debugging.
export const SignalsResponse = v.object({
  generatedAt: v.string(),
  sources: v.array(
    v.object({
      source: v.string(),
      rows: v.number(),
      lastPollMs: v.number(),
    }),
  ),
});
export type SignalsResponse = v.InferOutput<typeof SignalsResponse>;

export const Forecast = v.object({
  city: v.string(),
  date: v.string(),
  generatedAt: v.string(),
  verdict: v.picklist(["EASY", "MEDIUM", "HARD"]),
  arriveBy: v.nullable(v.string()),
  detail: v.string(),
});
export type Forecast = v.InferOutput<typeof Forecast>;

// zones.geojson is served as a FeatureCollection; each feature's properties:
export interface ZoneProperties extends ZoneRegime {
  name?: string;
}

// Landing-page "bring Karro to my city" vote — POST /v1/intent.
// country is an ISO-ish code from the picker (ES/PT/…/OTHER), city a
// free-text refinement, clientId the anonymous telemetry id.
export const IntentPayload = v.object({
  country: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
  city: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120))),
  clientId: v.optional(v.pipe(v.string(), v.maxLength(64))),
});
export type IntentPayload = v.InferOutput<typeof IntentPayload>;

export const IntentSummary = v.object({
  generatedAt: v.string(),
  total: v.number(),
  countries: v.array(v.object({ country: v.string(), n: v.number() })),
});
export type IntentSummary = v.InferOutput<typeof IntentSummary>;
