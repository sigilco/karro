// Open-Meteo forecast for Málaga — keyless JSON API, CC BY 4.0.
// https://open-meteo.com/ — hourly precipitation probability / rain / temp,
// ~hourly update cadence. Stored as one row per forecast hour keyed by the
// hour's epoch ms, so street-forecast can look up its `at` hour directly.

import { KARRO_UA, MALAGA_CENTER, parseIsoLocal } from "./util.ts";
import type { Connector, ExtSignalRow } from "./types.ts";

const URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${MALAGA_CENTER.lat}` +
  `&longitude=${MALAGA_CENTER.lon}` +
  "&hourly=precipitation_probability,rain,temperature_2m" +
  "&forecast_days=3&timezone=Europe%2FMadrid";

interface OpenMeteoResp {
  hourly?: {
    time?: string[];
    precipitation_probability?: (number | null)[];
    rain?: (number | null)[];
    temperature_2m?: (number | null)[];
  };
}

export const openmeteo: Connector = {
  name: "openmeteo",
  pollIntervalSec: 3600,
  async fetch(): Promise<ExtSignalRow[]> {
    const res = await fetch(URL, {
      headers: { "user-agent": KARRO_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const body = (await res.json()) as OpenMeteoResp;
    const h = body.hourly;
    if (!h?.time?.length) throw new Error("open-meteo: empty hourly");
    const rows: ExtSignalRow[] = [];
    for (let i = 0; i < h.time.length; i++) {
      const hourMs = parseIsoLocal(h.time[i]);
      if (hourMs === undefined) continue;
      rows.push({
        key: String(hourMs),
        fromMs: hourMs,
        toMs: hourMs + 3_600_000,
        valueNum: h.precipitation_probability?.[i] ?? 0,
        valueJson: JSON.stringify({
          rainMm: h.rain?.[i] ?? 0,
          tempC: h.temperature_2m?.[i] ?? null,
        }),
      });
    }
    return rows;
  },
};
