import type { Facility } from '~/packages/contract/src/index'

// Local geo helpers for the flows workstream — ~/packages/geo is owned by
// another workstream, so this file deliberately stays self-contained.

const EARTH_RADIUS_M = 6_371_000

export function haversineMeters(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s))
}

export function nearestFacilities(
  facilities: Facility[],
  lat: number,
  lon: number,
  count: number
): Facility[] {
  return [...facilities]
    .sort(
      (a, b) =>
        haversineMeters(lat, lon, a.lat, a.lon) -
        haversineMeters(lat, lon, b.lat, b.lon)
    )
    .slice(0, count)
}

// facility.projected holds free-space estimates at +5/+10/+15/+20 min.
// Linear interpolation between anchors; past +20 we extrapolate on
// velocityPerMin (spots/min over the shim's rolling window).
export function projectedAtMin(facility: Facility, driveMin: number): number {
  const now = facility.available ?? facility.projected[0] ?? 0
  const anchors: Array<[number, number]> = [[0, now]]
  facility.projected.forEach((p, i) => anchors.push([(i + 1) * 5, p]))
  if (driveMin <= 0) return Math.max(0, now)
  const last = anchors[anchors.length - 1]
  if (driveMin >= last[0]) {
    const velocity = facility.velocityPerMin ?? 0
    const projected = last[1] + velocity * (driveMin - last[0])
    const ceiling = facility.capacity ?? Number.POSITIVE_INFINITY
    return Math.max(0, Math.min(ceiling, Math.round(projected)))
  }
  for (let i = 1; i < anchors.length; i++) {
    const [t1, v1] = anchors[i]
    if (driveMin <= t1) {
      const [t0, v0] = anchors[i - 1]
      const ratio = (driveMin - t0) / (t1 - t0)
      return Math.max(0, Math.round(v0 + ratio * (v1 - v0)))
    }
  }
  return Math.max(0, Math.round(last[1]))
}
