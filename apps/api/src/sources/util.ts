// Shared helpers for external-source connectors. sources/ is a leaf layer:
// connectors own their URLs + parsing and emit normalized rows; they do not
// import the API core.

export const KARRO_UA = "karro-poc/0.2 (parking availability POC; contact: dev)";

// Málaga centroid — city-level signals (weather, holidays) anchor here.
export const MALAGA_CENTER = { lat: 36.7213, lon: -4.4214 };

// ── Madrid wall-clock conversion ─────────────────────────────────────────────
// Feeds publish "DD/MM/YYYY HH:MM" or "YYYY-MM-DDTHH:MM" in Europe/Madrid.
// Convert to epoch ms without a tz database by round-tripping through Intl.

const madridFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function localPartsAt(ms: number): { y: number; mo: number; d: number; h: number; mi: number } {
  const parts = madridFmt.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour") % 24,
    mi: get("minute"),
  };
}

/** Epoch ms for a wall-clock instant in Europe/Madrid. */
export function madridLocalToMs(y: number, mo: number, d: number, h: number, mi = 0): number {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const p = localPartsAt(guess);
    guess += want - Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  }
  return guess;
}

/** Parse "DD/MM/YYYY HH:MM" (SARE/cortes feeds) in Madrid local time. */
export function parseDmyHms(raw: string | null | undefined): number | undefined {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/.exec(
    (raw ?? "").trim(),
  );
  if (!m) return undefined;
  return madridLocalToMs(
    Number(m[3]),
    Number(m[2]),
    Number(m[1]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
}

/** Parse "YYYY-MM-DD[THH:MM[:SS]]" (open-meteo/nager) in Madrid local time. */
export function parseIsoLocal(raw: string | null | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec((raw ?? "").trim());
  if (!m) return undefined;
  return madridLocalToMs(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
}

/** "YYYY-MM-DD" for a timestamp's Madrid calendar day — holiday lookup key. */
export function madridDayKey(ms: number): string {
  const p = localPartsAt(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dp = rad(lat2 - lat1);
  const dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
