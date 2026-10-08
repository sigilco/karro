import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "one";
import { api } from "~/packages/contract/src/client";
import type { Facility } from "~/packages/contract/src/index";
import { Badge, Button, Card, useNow } from "~/packages/ui";
import { FacilityMap } from "~/components/map/FacilityMap";
import { clearParkedSpot, loadParkedSpot, saveParkedSpot, type ParkedSpot } from "./parkedSpot";
import type { BadgeTone } from "~/packages/ui";

const verdictTone: Record<string, BadgeTone> = {
  legal: "easy",
  paid: "accent",
  restricted: "hard",
  unknown: "neutral",
};

function formatElapsed(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function ParkedScreen(props: {
  lat: number | undefined;
  lon: number | undefined;
  name: string | undefined;
}) {
  const router = useRouter();
  const [spot, setSpot] = useState<ParkedSpot | undefined>(() => loadParkedSpot());
  const [error, setError] = useState<string | undefined>(undefined);
  const now = useNow(5_000);

  const rulesQ = useQuery({
    queryKey: ["rules", spot?.lat, spot?.lon],
    queryFn: () => api.rules(spot!.lat, spot!.lon),
    enabled: spot !== undefined,
    retry: 1,
  });

  const hasPrefill = props.lat !== undefined && props.lon !== undefined;

  function commit(lat: number, lon: number, name?: string) {
    const next: ParkedSpot = { lat, lon, ts: Date.now() };
    if (name !== undefined) next.name = name;
    saveParkedSpot(next);
    setSpot(next);
    setError(undefined);
  }

  function handleMarkParked() {
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => commit(p.coords.latitude, p.coords.longitude, props.name),
        () => {
          if (hasPrefill) commit(props.lat!, props.lon!, props.name);
          else setError("no position — allow location, or arrive from /drive");
        },
        { timeout: 10_000, maximumAge: 30_000 },
      );
      return;
    }
    if (hasPrefill) commit(props.lat!, props.lon!, props.name);
    else setError("geolocation unavailable");
  }

  function handleClear() {
    clearParkedSpot();
    setSpot(undefined);
  }

  const pseudoFacilityParking: Facility[] | undefined = spot
    ? [
        {
          id: "parked",
          name: spot.name ?? "Your spot",
          lat: spot.lat,
          lon: spot.lon,
          kind: "street_metered",
          capacity: 1,
          available: 1,
          velocityPerMin: 0,
          projected: [1, 1, 1, 1],
          dataAgeS: 0,
        },
      ]
    : undefined;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 bg-surface p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold text-ink">Parked</h1>
      </header>

      {spot === undefined ? (
        <Card className="flex flex-col items-center gap-4 py-8">
          <p className="text-center text-ink-dim">
            {hasPrefill && props.name ? `Just left ${props.name}?` : "No parked spot saved."}
          </p>
          <Button size="lg" className="w-full" onClick={handleMarkParked}>
            Mark parked
          </Button>
          {error ? <p className="text-center text-sm text-hard">{error}</p> : null}
          <Button variant="ghost" onClick={() => router.push("/dest")}>
            Find parking instead
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink">
                  {spot.name ?? "Your spot"}
                </p>
                <p className="text-sm text-ink-dim">
                  {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}
                </p>
              </div>
              <Badge tone="accent">{formatElapsed(now - spot.ts)}</Badge>
            </div>
            {rulesQ.data ? (
              <div className="mt-3 flex items-center gap-2">
                <Badge tone={verdictTone[rulesQ.data.verdict] ?? "neutral"}>
                  {rulesQ.data.verdict}
                </Badge>
                <p className="min-w-0 flex-1 text-sm text-ink-dim">{rulesQ.data.detail}</p>
              </div>
            ) : rulesQ.isLoading ? (
              <p className="mt-3 text-sm text-ink-dim">checking legality…</p>
            ) : null}
          </Card>

          {pseudoFacilityParking ? (
            <FacilityMap
              className="h-44 w-full rounded-2xl border border-ink-dim/15"
              facilities={pseudoFacilityParking}
              targetId="parked"
            />
          ) : null}

          <div className="flex gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-accent px-4 text-sm font-semibold text-surface"
            >
              Navigate back
            </a>
            <Button variant="ghost" onClick={handleClear}>
              Clear
            </Button>
          </div>

          <Button variant="ghost" onClick={() => router.push("/dest")}>
            Plan another trip
          </Button>
        </>
      )}
    </div>
  );
}
