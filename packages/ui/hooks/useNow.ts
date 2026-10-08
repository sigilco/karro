import { useSyncExternalStore } from "react";

// Ticking clock without useEffect: the interval is owned by the external
// store and only exists while at least one subscriber is mounted.
class ClockStore {
  private now = Date.now();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private intervalMs: number) {}

  getSnapshot = (): number => this.now;

  getServerSnapshot = (): number => this.now;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.timer === undefined) {
      this.timer = setInterval(() => {
        this.now = Date.now();
        for (const l of this.listeners) l();
      }, this.intervalMs);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  };
}

const stores = new Map<number, ClockStore>();

function storeFor(intervalMs: number): ClockStore {
  let store = stores.get(intervalMs);
  if (!store) {
    store = new ClockStore(intervalMs);
    stores.set(intervalMs, store);
  }
  return store;
}

export function useNow(intervalMs = 30_000): number {
  const store = storeFor(intervalMs);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
