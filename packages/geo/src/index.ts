// Geo helpers shared across screens: distance math, availability pressure,
// velocity formatting, zone styling, and data-age formatting.

// ── Distance ──────────────────────────────────────────────────────────────

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function distanceKm(a: LatLon, b: LatLon): number {
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}

export function nearestByDistance<T extends LatLon>(
  items: readonly T[],
  origin: LatLon,
  count: number,
): T[] {
  return [...items].sort((a, b) => distanceKm(a, origin) - distanceKm(b, origin)).slice(0, count);
}

// ── Availability pressure ─────────────────────────────────────────────────
// Matches pin coloring: >0.3 easy, 0.1–0.3 medium, <0.1 hard,
// null when available (or capacity) is unknown.

export type Pressure = "easy" | "medium" | "hard";

export interface AvailabilityLike {
  available: number | null;
  capacity: number | null;
}

export function pressure(facility: AvailabilityLike): Pressure | null {
  if (facility.available === null) return null;
  if (facility.capacity === null || facility.capacity <= 0) {
    // No capacity to ratio against — fall back on raw count.
    return facility.available > 0 ? "easy" : "hard";
  }
  const ratio = facility.available / facility.capacity;
  if (ratio > 0.3) return "easy";
  if (ratio >= 0.1) return "medium";
  return "hard";
}

// ── Velocity ──────────────────────────────────────────────────────────────
// velocityPerMin: spots/min over the shim's rolling window.
// positive = freeing up, negative = filling.

export interface VelocityLabel {
  arrow: "▲" | "▼" | "·";
  text: string;
  tone: "easy" | "hard" | "dim";
}

export function velocityLabel(velocityPerMin: number | null | undefined): VelocityLabel {
  if (velocityPerMin === null || velocityPerMin === undefined || velocityPerMin === 0) {
    return { arrow: "·", text: "steady", tone: "dim" };
  }
  const abs = Math.abs(velocityPerMin);
  const text = `${abs.toFixed(1)}/min`;
  if (velocityPerMin > 0) {
    return { arrow: "▲", text: `${text} freeing`, tone: "easy" };
  }
  return { arrow: "▼", text: `${text} filling`, tone: "hard" };
}

// ── Staleness ─────────────────────────────────────────────────────────────

export const STALE_AFTER_S = 300;

export function isStale(dataAgeS: number): boolean {
  return dataAgeS > STALE_AFTER_S;
}

export function formatAge(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function ageFromIso(iso: string, nowMs: number): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - t) / 1000);
}

// ── Zone styling ──────────────────────────────────────────────────────────
// Feature property `type` → color. Kept here so the map paint config and any
// legend/badges stay in sync.

export const ZONE_COLORS: Record<string, string> = {
  sare_blue: "#4fc3ff",
  sare_green: "#34d17b",
  loading: "#f5b83d",
  resident: "#a78bfa",
  free: "#9db3a1",
};

export const ZONE_FILL_OPACITY = 0.12;
export const ZBE_OUTLINE_COLOR = "#ef5a4f";

export function zoneColor(type: string | undefined | null): string {
  if (!type) return "#9db3a1";
  return ZONE_COLORS[type] ?? "#9db3a1";
}
