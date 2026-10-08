// Connector registry + scheduler. The 1-minute cron (worker) or setInterval
// (node) calls runConnectorsDue every tick; each connector polls at its own
// cadence via lastPoll tracking in the meta table — the same pattern
// pollOnce's rollup uses. A failed connector keeps its stale rows and its
// error is logged, never propagated: external signals are a bonus layer,
// they must never take the SMASSA poll down with them.

import { cortes } from "./cortes.ts";
import { holidays } from "./holidays.ts";
import { openmeteo } from "./openmeteo.ts";
import type { Connector } from "./types.ts";

export type { Connector, ExtSignalRow } from "./types.ts";

export const CONNECTORS: Connector[] = [openmeteo, holidays, cortes];

export interface ConnectorStore {
  replaceSignals(source: string, rows: import("./types.ts").ExtSignalRow[], nowMs: number): void;
  signalLastPollMs(source: string): number;
}

export async function runConnectorsDue(
  store: ConnectorStore,
  nowMs = Date.now(),
): Promise<string[]> {
  const ran: string[] = [];
  for (const c of CONNECTORS) {
    if (nowMs - store.signalLastPollMs(c.name) < c.pollIntervalSec * 1000) continue;
    try {
      const rows = await c.fetch();
      store.replaceSignals(c.name, rows, nowMs);
      ran.push(c.name);
    } catch (err) {
      console.warn(`[karro-api] connector ${c.name} failed (keeping stale rows):`, err);
    }
  }
  return ran;
}
