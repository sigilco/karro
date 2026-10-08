import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "one";
import type { OneRouter } from "one";
import { api } from "~/packages/contract/src/client";
import type { Facility } from "~/packages/contract/src";
import { FacilityMap } from "~/components/map/FacilityMap";
import {
  distanceKm,
  formatAge,
  isStale,
  nearestByDistance,
  pressure,
  velocityLabel,
} from "~/packages/geo/src";
import { ThemeToggle } from "~/packages/ui";

const MALAGA_CENTER = { lat: 36.72, lon: -4.42 };
const NEAREST_COUNT = 3;

// /dest is a sibling-owned route — not in this checkout's generated routes,
// so the literal needs a cast; it resolves to a real route at integration.
const DEST_HREF = "/dest" as OneRouter.Href;

const PRESSURE_PILL: Record<string, string> = {
  easy: "bg-easy/20 text-easy",
  medium: "bg-medium/20 text-medium",
  hard: "bg-hard/20 text-hard",
  unknown: "bg-ink-dim/20 text-ink-dim",
};

const VELOCITY_TEXT: Record<string, string> = {
  easy: "text-easy",
  hard: "text-hard",
  dim: "text-ink-dim",
};

export default function HomePage(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const facilitiesQuery = useQuery({
    queryKey: ["facilities"],
    queryFn: api.facilities,
    refetchInterval: 30_000,
  });

  const facilities = facilitiesQuery.data?.facilities ?? [];
  const selected =
    selectedId === undefined ? undefined : facilities.find((f) => f.id === selectedId);
  const nearest = nearestByDistance(facilities, MALAGA_CENTER, NEAREST_COUNT);

  const feedAgeS = facilitiesQuery.data
    ? facilities.reduce((max, f) => Math.max(max, f.dataAgeS), 0)
    : undefined;
  const feedStale = feedAgeS !== undefined && isStale(feedAgeS);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface text-ink">
      <FacilityMap
        className="absolute inset-0 h-full w-full"
        facilities={facilities}
        targetId={selectedId}
        follow={selected ? { lat: selected.lat, lon: selected.lon } : undefined}
        onSelect={setSelectedId}
      />

      {/* Search affordance → /dest */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href={DEST_HREF}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-ink/10 bg-surface-2/90 px-4 py-3 text-ink-dim shadow-xl backdrop-blur"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="flex-1 text-left text-[15px]">Where are you parking?</span>
          <span className="text-accent">→</span>
        </Link>

        {/* data freshness chip + theme toggle */}
        <div className="pointer-events-auto mt-2 flex w-full max-w-md items-center justify-between">
          <FeedChip
            pending={facilitiesQuery.isPending}
            errored={facilitiesQuery.isError}
            feedAgeS={feedAgeS}
            stale={feedStale}
          />
          <ThemeToggle />
        </div>
      </div>

      {/* bottom sheet: selected facility detail or nearest-3 list */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto w-full max-w-md">
          {selected ? (
            <FacilityCard facility={selected} onClose={() => setSelectedId(undefined)} />
          ) : (
            <NearestSheet facilities={nearest} onPick={setSelectedId} />
          )}
        </div>
      </div>
    </div>
  );
}

function FeedChip(props: {
  pending: boolean;
  errored: boolean;
  feedAgeS: number | undefined;
  stale: boolean;
}): JSX.Element {
  if (props.errored) {
    return (
      <span className="rounded-full border border-hard/40 bg-surface-2/90 px-3 py-1 text-xs text-hard backdrop-blur">
        live feed offline — retrying
      </span>
    );
  }
  if (props.pending || props.feedAgeS === undefined) {
    return (
      <span className="rounded-full border border-ink/10 bg-surface-2/90 px-3 py-1 text-xs text-ink-dim backdrop-blur">
        connecting to live feed…
      </span>
    );
  }
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs backdrop-blur ${
        props.stale
          ? "border-medium/40 bg-surface-2/90 text-medium"
          : "border-ink/10 bg-surface-2/90 text-ink-dim"
      }`}
    >
      data {formatAge(props.feedAgeS)}
    </span>
  );
}

function NearestSheet(props: {
  facilities: Facility[];
  onPick: (id: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface-2/95 shadow-2xl backdrop-blur">
      <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Nearest garages
      </div>
      {props.facilities.length === 0 ? (
        <div className="px-4 py-4 text-sm text-ink-dim">
          No live facilities yet — searching is your best bet.
        </div>
      ) : (
        <ul className="divide-y divide-ink/5">
          {props.facilities.map((f) => (
            <NearestRow key={f.id} facility={f} onPick={props.onPick} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NearestRow(props: { facility: Facility; onPick: (id: string) => void }): JSX.Element {
  const f = props.facility;
  const tone = pressure(f) ?? "unknown";
  const vel = velocityLabel(f.velocityPerMin);
  const stale = isStale(f.dataAgeS);
  const km = distanceKm(f, MALAGA_CENTER);
  return (
    <li>
      <button
        type="button"
        onClick={() => props.onPick(f.id)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-ink/5"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            tone === "easy"
              ? "bg-easy"
              : tone === "medium"
                ? "bg-medium"
                : tone === "hard"
                  ? "bg-hard"
                  : "bg-ink-dim"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{f.name}</span>
          <span className="block text-xs text-ink-dim">{km.toFixed(1)} km</span>
        </span>
        <span
          className={`text-right text-sm font-semibold tabular-nums ${
            stale ? "text-ink-dim/60" : "text-ink"
          }`}
        >
          {f.available === null ? "–" : f.available}
        </span>
        <span className={`w-20 text-right text-xs ${VELOCITY_TEXT[vel.tone]}`}>
          {vel.arrow} {vel.text}
        </span>
      </button>
    </li>
  );
}

function FacilityCard(props: { facility: Facility; onClose: () => void }): JSX.Element {
  const f = props.facility;
  const tone = pressure(f) ?? "unknown";
  const vel = velocityLabel(f.velocityPerMin);
  const stale = isStale(f.dataAgeS);
  return (
    <div className="rounded-2xl border border-ink/10 bg-surface-2/95 p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-ink">{f.name}</div>
          <div className="mt-0.5 text-xs text-ink-dim">
            {f.kind.replace("_", " ")} · data {formatAge(f.dataAgeS)}
            {f.priceEurPerHour !== undefined && ` · €${f.priceEurPerHour.toFixed(2)}/h`}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-full px-2 py-1 text-ink-dim transition-colors active:bg-ink/10"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-end gap-4">
        <div>
          <div
            className={`text-2xl font-bold tabular-nums ${stale ? "text-ink-dim/60" : "text-ink"}`}
          >
            {f.available === null ? "–" : f.available}
            <span className="text-sm font-normal text-ink-dim">
              {f.capacity === null ? "" : ` / ${f.capacity}`}
            </span>
          </div>
          <div className="text-xs text-ink-dim">free now</div>
        </div>
        <div className={`text-sm font-medium ${VELOCITY_TEXT[vel.tone]}`}>
          {vel.arrow} {vel.text}
        </div>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${PRESSURE_PILL[tone]}`}
        >
          {tone === "unknown" ? "no data" : tone}
        </span>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-dim">
            projected +5–20 min
          </div>
          <ProjectedSpark values={f.projected} capacity={f.capacity} />
        </div>
        <Link
          href={`/dest?facility=${encodeURIComponent(f.id)}` as OneRouter.Href}
          className="shrink-0 rounded-xl bg-accent px-6 py-3 text-base font-bold text-surface shadow-lg transition-transform active:scale-95"
        >
          GO
        </Link>
      </div>
    </div>
  );
}

function ProjectedSpark(props: { values: number[]; capacity: number | null }): JSX.Element {
  const max = Math.max(props.capacity ?? 0, ...props.values, 1);
  return (
    <div className="flex h-9 items-end gap-1.5">
      {props.values.map((v, i) => (
        <div
          key={i}
          className="w-4 rounded-sm bg-accent/70"
          style={{
            height: `${Math.max(10, Math.round((v / max) * 100))}%`,
          }}
          title={`+${(i + 1) * 5} min: ${Math.round(v)} free`}
        />
      ))}
    </div>
  );
}
