import { useCallback, useRef, useSyncExternalStore } from "react";
import type { JSX } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/packages/contract/src/client";
import type { Facility } from "~/packages/contract/src";
import { pressure, ZONE_COLORS, ZONE_FILL_OPACITY, ZBE_OUTLINE_COLOR } from "~/packages/geo/src";
import { getTheme, useTheme } from "~/packages/ui/theme";

// ── Contract ──────────────────────────────────────────────────────────────
// Frozen signature — sibling screens import this component.

// GeoJSON.FeatureCollection, resolved through maplibre's own typings
// (@types/geojson is a transitive dep, so a bare 'geojson' import won't resolve).
type FeatureCollection = Extract<
  Parameters<maplibregl.GeoJSONSource["setData"]>[0],
  { type: "FeatureCollection" }
>;

export interface FacilityMapProps {
  facilities: Facility[];
  zones?: FeatureCollection;
  targetId?: string;
  follow?: { lat: number; lon: number };
  onSelect?: (id: string) => void;
  onZoneQuery?: (lat: number, lon: number) => void;
  className?: string;
}

// ── Module constants ──────────────────────────────────────────────────────

const MALAGA_CENTER: [number, number] = [-4.42, 36.72];
const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// OpenFreeMap vector styles — free, no key (Carto dark_all raster now
// watermarks "API KEY REQUIRED"). Kept as URLs so MapLibre loads the style
// document directly; attribution is embedded in the style's sources.
const DARK_BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const LIGHT_BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function basemapForTheme(): string {
  return getTheme() === "light" ? LIGHT_BASEMAP_STYLE : DARK_BASEMAP_STYLE;
}

const ZONE_FILL_COLOR: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "type"],
  "sare_blue",
  ZONE_COLORS.sare_blue,
  "sare_green",
  ZONE_COLORS.sare_green,
  "loading",
  ZONE_COLORS.loading,
  "resident",
  ZONE_COLORS.resident,
  "free",
  ZONE_COLORS.free,
  "#9db3a1",
];

// ── Imperative map host ───────────────────────────────────────────────────
// The MapLibre instance lives outside React state. Props are applied after
// each commit (see useApplyAfterCommit) so the map always converges to the
// latest props without useEffect.

interface Pin {
  marker: maplibregl.Marker;
  el: HTMLDivElement;
}

interface MapHost {
  map: maplibregl.Map | null;
  loaded: boolean;
  props: FacilityMapProps | null;
  pins: Map<string, Pin>;
  applied: {
    facilities: readonly Facility[] | null;
    zones: FeatureCollection | null;
    followKey: string | null;
    basemap: string | null;
  };
}

function createHost(): MapHost {
  return {
    map: null,
    loaded: false,
    props: null,
    pins: new Map(),
    applied: { facilities: null, zones: null, followKey: null, basemap: null },
  };
}

// ── Pins ──────────────────────────────────────────────────────────────────

const PIN_BASE =
  "flex h-9 w-9 items-center justify-center rounded-full border-2 border-surface " +
  "text-[13px] font-bold text-surface shadow-lg cursor-pointer select-none " +
  "transition-transform duration-150";

const PIN_TONE: Record<string, string> = {
  easy: "bg-easy",
  medium: "bg-medium",
  hard: "bg-hard",
  unknown: "bg-ink-dim",
};

const PIN_SELECTED_CLASSES = ["scale-125", "ring-2", "ring-accent", "z-20"];

function buildPinEl(f: Facility): HTMLDivElement {
  const el = document.createElement("div");
  const tone = pressure(f) ?? "unknown";
  el.className = `${PIN_BASE} ${PIN_TONE[tone]}`;
  el.textContent = f.available === null ? "–" : String(f.available);
  el.title = f.name;
  return el;
}

function applyTarget(host: MapHost, targetId: string | undefined): void {
  for (const [id, pin] of host.pins) {
    const selected = id === targetId;
    for (const cls of PIN_SELECTED_CLASSES) {
      pin.el.classList.toggle(cls, selected);
    }
  }
}

function syncPins(host: MapHost, map: maplibregl.Map, facilities: readonly Facility[]): void {
  if (facilities === host.applied.facilities) {
    applyTarget(host, host.props?.targetId);
    return;
  }
  for (const pin of host.pins.values()) {
    pin.marker.remove();
  }
  host.pins.clear();
  for (const f of facilities) {
    const el = buildPinEl(f);
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      host.props?.onSelect?.(f.id);
    });
    const marker = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([f.lon, f.lat])
      .addTo(map);
    host.pins.set(f.id, { marker, el });
  }
  host.applied.facilities = facilities;
  applyTarget(host, host.props?.targetId);
}

// ── Zones / follow ────────────────────────────────────────────────────────

function applyZones(host: MapHost, map: maplibregl.Map): void {
  const zones = host.props?.zones ?? null;
  if (zones === host.applied.zones) return;
  const source = map.getSource("zones") as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(zones ?? EMPTY_FC);
    host.applied.zones = zones;
  }
}

function applyFollow(host: MapHost, map: maplibregl.Map): void {
  const follow = host.props?.follow;
  if (!follow) {
    host.applied.followKey = null;
    return;
  }
  const key = `${follow.lat.toFixed(5)},${follow.lon.toFixed(5)}`;
  if (key === host.applied.followKey) return;
  host.applied.followKey = key;
  map.easeTo({
    center: [follow.lon, follow.lat],
    bearing: 0,
    pitch: 55,
    duration: 900,
  });
}

function applyBasemap(host: MapHost, map: maplibregl.Map): void {
  const want = basemapForTheme();
  if (host.applied.basemap === want) return;
  host.applied.basemap = want;
  map.setStyle(want);
}

function applyProps(host: MapHost): void {
  const map = host.map;
  const props = host.props;
  if (!map || !props) return;
  if (host.loaded) applyBasemap(host, map);
  syncPins(host, map, props.facilities);
  if (host.loaded) applyZones(host, map);
  applyFollow(host, map);
}

// ── Layers / mount ────────────────────────────────────────────────────────

function addZoneLayers(map: maplibregl.Map): void {
  map.addSource("zones", { type: "geojson", data: EMPTY_FC });
  map.addLayer({
    id: "zones-fill",
    type: "fill",
    source: "zones",
    paint: {
      "fill-color": ZONE_FILL_COLOR,
      "fill-opacity": ZONE_FILL_OPACITY,
    },
  });
  map.addLayer({
    id: "zones-loading-line",
    type: "line",
    source: "zones",
    filter: ["==", ["get", "type"], "loading"],
    paint: {
      "line-color": ZONE_COLORS.loading,
      "line-width": 1.5,
      "line-dasharray": [2, 1.5],
      "line-opacity": 0.7,
    },
  });
  map.addLayer({
    id: "zones-zbe-outline",
    type: "line",
    source: "zones",
    filter: ["==", ["get", "zbe"], true],
    paint: {
      "line-color": ZBE_OUTLINE_COLOR,
      "line-width": 1.5,
      "line-dasharray": [3, 2],
      "line-opacity": 0.8,
    },
  });
}

function mountMap(host: MapHost, el: HTMLDivElement): () => void {
  const map = new maplibregl.Map({
    container: el,
    style: basemapForTheme(),
    center: MALAGA_CENTER,
    zoom: 14,
    attributionControl: { compact: true },
  });
  map.addControl(
    new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }),
    "bottom-right",
  );
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");
  map.on("load", () => {
    host.loaded = true;
    addZoneLayers(map);
    applyProps(host);
  });
  // Re-add zone overlays after a theme-driven setStyle (custom layers are
  // dropped with the old style; DOM markers survive).
  map.on("style.load", () => {
    if (!host.loaded || map.getSource("zones")) return;
    addZoneLayers(map);
    host.applied.zones = null;
    applyProps(host);
  });
  map.on("click", (e) => {
    host.props?.onZoneQuery?.(e.lngLat.lat, e.lngLat.lng);
  });
  host.map = map;
  return () => {
    host.map = null;
    host.loaded = false;
    host.pins.clear();
    host.applied = { facilities: null, zones: null, followKey: null, basemap: null };
    map.remove();
  };
}

// ── Commit hook ───────────────────────────────────────────────────────────
// useSyncExternalStore re-subscribes whenever the subscribe function's
// identity changes. Passing a fresh closure every render makes `apply` run
// after every committed render — a mount/update hook built from allowed
// primitives (useEffect is banned repo-wide).

function noop(): void {}

function snapshotZero(): number {
  return 0;
}

function useApplyAfterCommit(apply: () => void): void {
  useSyncExternalStore(
    function subscribe() {
      apply();
      return noop;
    },
    snapshotZero,
    snapshotZero,
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export function FacilityMap(props: FacilityMapProps): JSX.Element {
  "use no memo"; // imperative map sync — skip React Compiler here
  const hostRef = useRef<MapHost | null>(null);
  const theme = useTheme();
  void theme; // subscribe so theme flips re-run the post-commit apply pass

  // Fetch zones ourselves unless the caller drives them via props.
  const zonesQuery = useQuery({
    queryKey: ["zones-geojson"],
    queryFn: api.zonesGeoJson,
    staleTime: 30_000,
    enabled: props.zones === undefined,
  });
  const effectiveZones = props.zones ?? zonesQuery.data;

  // Attach/detach the map via a React 19 ref callback (cleanup on unmount).
  const attach = useCallback(function attachContainer(el: HTMLDivElement | null) {
    if (!el) return undefined;
    const host = createHost();
    hostRef.current = host;
    return mountMap(host, el);
  }, []);

  // After every commit, converge the map to the latest props.
  const effectiveProps: FacilityMapProps = {
    ...props,
    zones: effectiveZones,
  };
  useApplyAfterCommit(() => {
    const host = hostRef.current;
    if (!host) return;
    host.props = effectiveProps;
    applyProps(host);
  });

  return (
    <div
      className={`relative overflow-hidden ${props.className ?? ""}`}
      style={{ minHeight: 0, minWidth: 0 }}
    >
      {/* h-full/w-full not inset-0: maplibregl-map forces position:relative,
          so inset-0 wouldn't stretch the container */}
      <div ref={attach} className="h-full w-full" />
    </div>
  );
}
