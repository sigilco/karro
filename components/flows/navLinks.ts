// Companion-mode handoff: deeplinks into turn-by-turn nav apps.
// Karro decides WHERE to park; Google/Apple/Waze do the driving.
// Universal https links resolve to the installed app on mobile, web on desktop.

export interface NavTarget {
  lat: number;
  lon: number;
  name?: string;
}

export function googleMapsUrl(t: NavTarget): string {
  const name = t.name ? ` (${encodeURIComponent(t.name)})` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lon}${name}&travelmode=driving`;
}

export function appleMapsUrl(t: NavTarget): string {
  return `https://maps.apple.com/?daddr=${t.lat},${t.lon}&dirflg=d`;
}

export function wazeUrl(t: NavTarget): string {
  return `https://waze.com/ul?ll=${t.lat},${t.lon}&navigate=yes`;
}
