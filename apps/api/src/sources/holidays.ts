// Nager.Date public holidays — keyless JSON API, free for non-commercial use.
// https://date.nager.at — /v3/PublicHolidays/{year}/ES returns national +
// regional holidays; keep global ones plus Andalusia (ES-AN) regional.
// Málaga's two municipal holidays (Aug 19, Sep 8) are not covered — noted in
// REPORT.md. Poll daily; rows keyed by "YYYY-MM-DD" (madridDayKey lookup).

import { KARRO_UA, parseIsoLocal } from "./util.ts";
import type { Connector, ExtSignalRow } from "./types.ts";

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  global: boolean;
  counties: string[] | null;
}

async function fetchYear(year: number): Promise<ExtSignalRow[]> {
  const res = await fetch(`https://date.nager.at/api/v3/publicholidays/${year}/ES`, {
    headers: { "user-agent": KARRO_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`nager ${res.status}`);
  const days = (await res.json()) as NagerHoliday[];
  const rows: ExtSignalRow[] = [];
  for (const d of days) {
    if (!d.global && !(d.counties ?? []).includes("ES-AN")) continue;
    const fromMs = parseIsoLocal(d.date);
    if (fromMs === undefined) continue;
    rows.push({
      key: d.date,
      fromMs,
      toMs: fromMs + 24 * 3_600_000,
      valueNum: 1,
      valueJson: JSON.stringify({ name: d.localName }),
    });
  }
  return rows;
}

export const holidays: Connector = {
  name: "holidays",
  pollIntervalSec: 24 * 3600,
  async fetch(): Promise<ExtSignalRow[]> {
    // Current year is enough for forecasting; pull next year in December so
    // `at` values crossing New Year still resolve.
    const year = new Date().getUTCFullYear();
    const rows = await fetchYear(year);
    if (new Date().getUTCMonth() >= 11) {
      try {
        rows.push(...(await fetchYear(year + 1)));
      } catch {
        // next-year list may not be published yet — non-fatal
      }
    }
    return rows;
  },
};
