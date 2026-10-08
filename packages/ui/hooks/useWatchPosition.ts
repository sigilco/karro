import { useSyncExternalStore } from "react";

export interface GeoPosition {
  lat: number;
  lon: number;
  accuracy: number | undefined;
  ts: number;
}

export interface GeoState {
  position: GeoPosition | undefined;
  error: string | undefined;
  watching: boolean;
}

const idle: GeoState = { position: undefined, error: undefined, watching: false };

// Geolocation without useEffect: navigator.watchPosition is a callback API,
// so it lives in an external store that starts on first subscribe and stops
// when the last subscriber unmounts.
class GeoStore {
  private state: GeoState = idle;
  private listeners = new Set<() => void>();
  private watchId: number | undefined;

  getSnapshot = (): GeoState => this.state;

  getServerSnapshot = (): GeoState => idle;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  private set(patch: Partial<GeoState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private start() {
    if (this.watchId !== undefined) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      this.set({ error: "geolocation unavailable" });
      return;
    }
    this.set({ watching: true });
    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        this.set({
          position: {
            lat: p.coords.latitude,
            lon: p.coords.longitude,
            accuracy: p.coords.accuracy,
            ts: p.timestamp,
          },
          error: undefined,
        }),
      (err) => this.set({ error: err.message, watching: false }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
  }

  private stop() {
    if (this.watchId === undefined) return;
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = undefined;
    this.set({ watching: false });
  }
}

const store = new GeoStore();

export function useWatchPosition(): GeoState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
