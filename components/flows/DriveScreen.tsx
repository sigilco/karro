import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "one";
import type { Facility } from "~/packages/contract/src/index";
import { api } from "~/packages/contract/src/client";
import { Badge, Button, Card, Sheet, useWatchPosition } from "~/packages/ui";
import { FacilityMap } from "~/components/map/FacilityMap";
import { haversineMeters, nearestFacilities, projectedAtMin } from "./geo";
import { toneForVerdict, verdictForProjected } from "./verdict";
import { announceDelta, resetDeltaSignature, setVoiceEnabled, speakNow, voiceEnabled } from "./tts";
import { appleMapsUrl, googleMapsUrl, wazeUrl } from "./navLinks";
import { pingOnce, playArrivalChime } from "./ping";

const ARRIVAL_RADIUS_M = 400;

const STALE_AFTER_S = 300;
// ~500m grid — ETA doesn't refetch on every GPS tick, only on real movement.
const ETA_GRID_DEG = 0.005;

export function DriveScreen(props: {
  targetId: string | undefined;
  destLat: number | undefined;
  destLon: number | undefined;
}) {
  const router = useRouter();
  const geo = useWatchPosition();
  const [voice, setVoice] = useState(voiceEnabled());

  const facilitiesQ = useQuery({
    queryKey: ["facilities"],
    queryFn: api.facilities,
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });
  const zonesQ = useQuery({
    queryKey: ["zones"],
    queryFn: api.zonesGeoJson,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const facilities = facilitiesQ.data?.facilities ?? [];
  const target = facilities.find((f) => f.id === props.targetId);

  const origin =
    geo.position ??
    (props.destLat !== undefined && props.destLon !== undefined
      ? { lat: props.destLat, lon: props.destLon }
      : undefined);
  const qOrigin = origin
    ? {
        lat: Math.round(origin.lat / ETA_GRID_DEG) * ETA_GRID_DEG,
        lon: Math.round(origin.lon / ETA_GRID_DEG) * ETA_GRID_DEG,
      }
    : undefined;

  const etaQ = useQuery({
    queryKey: ["eta", qOrigin?.lat, qOrigin?.lon, target?.lat, target?.lon],
    queryFn: () => api.eta(qOrigin!.lat, qOrigin!.lon, target!.lat, target!.lon),
    enabled: qOrigin !== undefined && target !== undefined,
    refetchInterval: 30_000,
    retry: 1,
  });

  const driveMin = etaQ.data?.driveMin;
  const atEta = target && driveMin !== undefined ? projectedAtMin(target, driveMin) : undefined;
  const verdict = atEta !== undefined ? verdictForProjected(atEta) : undefined;
  const stale = target !== undefined && target.dataAgeS > STALE_AFTER_S;

  // Next-best alternative: 5 nearest candidates, each projected at its own ETA.
  const candidates = origin
    ? nearestFacilities(
        facilities.filter((f) => f.id !== target?.id),
        origin.lat,
        origin.lon,
        5,
      )
    : [];
  const candidateEtas = useQueries({
    queries: candidates.map((f) => ({
      queryKey: ["eta", qOrigin?.lat, qOrigin?.lon, f.lat, f.lon],
      queryFn: () => api.eta(qOrigin!.lat, qOrigin!.lon, f.lat, f.lon),
      enabled: qOrigin !== undefined,
      staleTime: 60_000,
      retry: 1,
    })),
  });

  let best: { facility: Facility; atEta: number } | undefined;
  candidates.forEach((f, i) => {
    const dm = candidateEtas[i]?.data?.driveMin;
    if (dm === undefined) return;
    const at = projectedAtMin(f, dm);
    if (!best || at > best.atEta) best = { facility: f, atEta: at };
  });

  // Voice deltas only — the signature changes on target/verdict/number change.
  if (!stale && target && verdict !== undefined && atEta !== undefined) {
    announceDelta(
      `${target.id}:${verdict}:${atEta}`,
      `${target.name}: about ${atEta} spaces at arrival — ${verdict}`,
    );
  }

  // Arrival ping: chime once when the driver closes within 400m of the target.
  const arriving =
    origin !== undefined &&
    target !== undefined &&
    haversineMeters(origin.lat, origin.lon, target.lat, target.lon) <= ARRIVAL_RADIUS_M;
  if (arriving && target && pingOnce(`arrive:${target.id}`)) {
    playArrivalChime();
  }

  function retarget(f: Facility) {
    router.replace(`/drive?to=${f.id}&lat=${f.lat}&lon=${f.lon}`);
  }

  function handleSwitch() {
    if (!best) return;
    resetDeltaSignature(); // force the new target's situation to be announced
    if (voiceEnabled()) {
      speakNow(`Switching to ${best.facility.name}: about ${best.atEta} spaces`);
    }
    retarget(best.facility);
  }

  function handleVoiceToggle() {
    const next = !voice;
    setVoiceEnabled(next);
    setVoice(next);
    if (next) speakNow("Voice on");
  }

  function handleEndDrive() {
    const params = new URLSearchParams();
    if (target) {
      params.set("lat", String(target.lat));
      params.set("lon", String(target.lon));
      params.set("name", target.name);
    }
    router.push(`/parked?${params.toString()}`);
  }

  if (!target) {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface p-6">
        <Card className="max-w-sm text-center">
          {facilitiesQ.isLoading ? (
            <p className="text-ink-dim">loading live feed…</p>
          ) : (
            <>
              <p className="mb-4 text-ink">No drive target set.</p>
              <Button onClick={() => router.push("/dest")}>Pick a destination</Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-surface">
      <FacilityMap
        className="absolute inset-0 h-full w-full"
        facilities={facilities}
        zones={zonesQ.data}
        targetId={target.id}
        follow={geo.position ? { lat: geo.position.lat, lon: geo.position.lon } : undefined}
        onSelect={(id) => {
          const f = facilities.find((x) => x.id === id);
          if (f) retarget(f);
        }}
      />

      {/* glance card — one number, one color, ≤8 words */}
      <div
        className="absolute inset-x-0 top-0 z-10 px-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <Card className="bg-surface-2/95 backdrop-blur">
          {stale ? (
            <p className="py-2 text-center text-base font-semibold text-ink-dim">
              data stale — heading only
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink">
                  {arriving ? "Arriving · " : ""}
                  {target.name}
                </p>
                <p className="text-sm text-ink-dim">
                  {driveMin !== undefined ? `${Math.round(driveMin)} min` : "… min"}
                  {target.available !== null ? ` · ${target.available} now` : ""}
                </p>
              </div>
              <p
                className={`text-5xl font-black tabular-nums ${
                  verdict === "EASY"
                    ? "text-easy"
                    : verdict === "MEDIUM"
                      ? "text-medium"
                      : verdict === "HARD"
                        ? "text-hard"
                        : "text-ink-dim"
                }`}
              >
                {atEta !== undefined ? `~${atEta}` : "—"}
              </p>
              {verdict ? <Badge tone={toneForVerdict(verdict)}>{verdict}</Badge> : null}
            </div>
          )}
        </Card>
      </div>

      <Sheet>
        {best ? (
          <Button size="lg" className="w-full" onClick={handleSwitch}>
            ⇄ Switch: {best.facility.name} — ~{best.atEta} at arrival
          </Button>
        ) : (
          <Button size="lg" className="w-full" variant="ghost" disabled>
            no alternative yet
          </Button>
        )}
        {/* companion-mode handoff — Karro picks the spot, nav apps drive */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <a
            href={googleMapsUrl({ lat: target.lat, lon: target.lon, name: target.name })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-accent/15 text-xs font-semibold text-ink"
          >
            G Maps
          </a>
          <a
            href={appleMapsUrl({ lat: target.lat, lon: target.lon, name: target.name })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-accent/15 text-xs font-semibold text-ink"
          >
            Apple Maps
          </a>
          <a
            href={wazeUrl({ lat: target.lat, lon: target.lon, name: target.name })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-accent/15 text-xs font-semibold text-ink"
          >
            Waze
          </a>
        </div>

        <div className="mt-2 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={handleEndDrive}>
            End drive
          </Button>
          <Button variant="ghost" onClick={handleVoiceToggle}>
            {voice ? "Voice on" : "Voice off"}
          </Button>
        </div>
        {geo.error ? (
          <p className="mt-2 text-center text-xs text-ink-dim">
            location {geo.error} — ETA from last known point
          </p>
        ) : null}
      </Sheet>
    </div>
  );
}
