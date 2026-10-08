// Málaga road-works / closures — datosabiertos.malaga.eu CKAN, CC BY 4.0.
// https://datosabiertos.malaga.eu/dataset/cortes-de-trafico — GeoJSON points
// with DESDE/HASTA validity windows and TIPOAFECTACION ("Corte",
// "Ocupación de calzada", "Ocupación de estacionamiento" — the last literally
// removes curb parking). Refresh cadence is the city's (observed daily-ish);
// polling every 30 min keeps it fresh without hammering the flaky portal.

import { KARRO_UA, parseDmyHms } from "./util.ts";
import type { Connector, ExtSignalRow } from "./types.ts";

const URL =
  "https://datosabiertos.malaga.eu/recursos/transporte/trafico/da_cortesTrafico-4326.geojson";

interface CortesFeature {
  geometry?: { type?: string; coordinates?: [number, number, number?] };
  properties?: {
    ID?: number | string;
    NOMBRE?: string;
    DESCRIPCION?: string;
    DIRECCION?: string;
    TIPOAFECTACION?: string;
    TIPOCORTE?: string;
    DESDE?: string;
    HASTA?: string;
  };
}

export const cortes: Connector = {
  name: "cortes",
  pollIntervalSec: 1800,
  async fetch(): Promise<ExtSignalRow[]> {
    const res = await fetch(URL, {
      headers: { "user-agent": KARRO_UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`cortes ${res.status}`);
    const body = (await res.json()) as { features?: CortesFeature[] };
    const feats = body.features ?? [];
    const rows: ExtSignalRow[] = [];
    for (const f of feats) {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || p.ID == null) continue;
      const tipo = (p.TIPOAFECTACION ?? "").trim();
      rows.push({
        key: String(p.ID),
        fromMs: parseDmyHms(p.DESDE),
        toMs: parseDmyHms(p.HASTA),
        // weight: parking occupation hits curb capacity hardest, then full
        // closures, then plain lane occupation.
        valueNum: tipo === "Ocupación de estacionamiento" ? 2 : tipo === "Corte" ? 1.5 : 1,
        valueJson: JSON.stringify({
          lat,
          lon,
          tipo,
          dir: (p.DIRECCION ?? "").trim(),
        }),
      });
    }
    if (rows.length === 0) throw new Error("cortes: parsed 0 rows");
    return rows;
  },
};
