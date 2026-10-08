// Connector contract: each external source emits normalized signal rows that
// SqlHistory persists in ext_signal (one row per key, replaced wholesale on
// every successful poll — the table always reflects the latest snapshot).

export interface ExtSignalRow {
  /** Dedupe key within the source (corte id, hour ms, "YYYY-MM-DD", ...). */
  key: string;
  /** Start of the window this row describes (ms), when known. */
  fromMs?: number;
  /** End of the window this row describes (ms), when known. */
  toMs?: number;
  /** Primary numeric payload (probability %, count, flag 1). */
  valueNum?: number;
  /** Structured payload, JSON-encoded. */
  valueJson?: string;
}

export interface Connector {
  /** Source slug; becomes ext_signal.source and meta key "lastPoll:<name>". */
  name: string;
  /** Minimum seconds between polls; the 1-min cron runs due connectors only. */
  pollIntervalSec: number;
  /** Fetch + normalize. Throw on failure — rows are kept until a success. */
  fetch(): Promise<ExtSignalRow[]>;
}
