// Parked-spot persistence — URL params + localStorage are the only state
// channels between routes, per the brief.

export interface ParkedSpot {
  lat: number;
  lon: number;
  ts: number;
  name?: string;
}

const KEY = "karro:parked";

export function loadParkedSpot(): ParkedSpot | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<ParkedSpot>;
    if (
      typeof parsed.lat !== "number" ||
      typeof parsed.lon !== "number" ||
      typeof parsed.ts !== "number"
    ) {
      return undefined;
    }
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      ts: parsed.ts,
      name: typeof parsed.name === "string" ? parsed.name : undefined,
    };
  } catch {
    return undefined;
  }
}

export function saveParkedSpot(spot: ParkedSpot) {
  localStorage.setItem(KEY, JSON.stringify(spot));
}

export function clearParkedSpot() {
  localStorage.removeItem(KEY);
}
