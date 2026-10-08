import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "one";
import { useState, type JSX } from "react";
import { api } from "~/packages/contract/src/client";
import type { Forecast } from "~/packages/contract/src";

const VERDICT_STYLE: Record<Forecast["verdict"], { word: string; text: string; dot: string }> = {
  EASY: { word: "EASY", text: "text-easy", dot: "bg-easy" },
  MEDIUM: { word: "MEDIUM", text: "text-medium", dot: "bg-medium" },
  HARD: { word: "HARD", text: "text-hard", dot: "bg-hard" },
};

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isIsoDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function cityLabel(city: string): string {
  return city.charAt(0).toUpperCase() + city.slice(1);
}

function arrivalHint(forecast: Forecast): string {
  if (forecast.arriveBy) return `Best arrival window: before ${forecast.arriveBy}`;
  if (forecast.verdict === "EASY") return "Arrive anytime — plenty of space expected";
  return "Earlier is better — options thin out fast";
}

function ShareButton(props: { url: string; city: string; date: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function handleShare(): Promise<void> {
    const nav = navigator as Navigator & {
      share?: (data: { title: string; text: string; url: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({
          title: `Karro — ${cityLabel(props.city)} parking ${props.date}`,
          text: `Parking forecast for ${cityLabel(props.city)} on ${prettyDate(props.date)}`,
          url: props.url,
        });
        return;
      } catch {
        // user dismissed or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable (insecure context) — leave link selectable
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="w-full rounded-2xl border border-ink-dim/30 bg-surface-2 px-6 py-4 text-base font-semibold text-ink transition-colors active:bg-surface-2/70"
    >
      {copied ? "Link copied" : "Share this forecast"}
    </button>
  );
}

function LoadingShell(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
      <div className="h-16 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-4 w-64 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

function ForecastBody(props: { forecast: Forecast; date: string }): JSX.Element {
  const style = VERDICT_STYLE[props.forecast.verdict];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="flex items-center gap-2 text-sm uppercase tracking-widest text-ink-dim">
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
        {cityLabel(props.forecast.city)} · {prettyDate(props.date)}
      </div>
      <h1 className={`text-7xl font-black leading-none tracking-tight ${style.text}`}>
        {style.word}
      </h1>
      {props.forecast.arriveBy ? (
        <p className="text-2xl font-semibold text-ink">Arrive by {props.forecast.arriveBy}</p>
      ) : undefined}
      <p className="max-w-xs text-base leading-relaxed text-ink-dim">{props.forecast.detail}</p>
      <p className="rounded-full bg-surface-2 px-4 py-2 text-sm text-ink">
        {arrivalHint(props.forecast)}
      </p>
    </div>
  );
}

export default function SharePage(): JSX.Element {
  const searchParams = useSearchParams();
  const cityParam = searchParams.get("city")?.toLowerCase();
  const city = cityParam && /^[a-z-]+$/.test(cityParam) ? cityParam : "malaga";
  const dateParam = searchParams.get("date") ?? undefined;
  const date = isIsoDate(dateParam) ? dateParam : todayIso();
  const pageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/share?city=${city}&date=${date}`
      : `/share?city=${city}&date=${date}`;

  const forecast = useQuery({
    queryKey: ["forecast", city, date],
    queryFn: () => api.forecast(city, date),
    staleTime: 30_000,
    retry: 1,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-surface px-6 py-8 text-ink">
      <header className="flex items-center justify-between">
        <span className="text-sm font-bold tracking-widest text-ink">KARRO</span>
        <span className="text-xs text-ink-dim">parking forecast</span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-10">
        {forecast.isPending ? <LoadingShell /> : undefined}
        {forecast.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <p className="text-xl font-semibold text-ink">Couldn't load the forecast</p>
            <p className="text-sm text-ink-dim">
              The live feed may be down — try again in a minute.
            </p>
            <button
              type="button"
              onClick={() => forecast.refetch()}
              className="rounded-full bg-surface-2 px-5 py-2 text-sm font-semibold text-ink"
            >
              Retry
            </button>
          </div>
        ) : undefined}
        {forecast.data ? <ForecastBody forecast={forecast.data} date={date} /> : undefined}
      </main>

      <div className="flex flex-col gap-3">
        <a
          href="/map"
          className="block w-full rounded-2xl bg-easy px-6 py-4 text-center text-base font-bold text-surface transition-opacity active:opacity-80"
        >
          Open live map
        </a>
        <ShareButton url={pageUrl} city={city} date={date} />
      </div>

      <footer className="pt-8 text-center text-xs text-ink-dim">
        Karro — parking that'll still be there
      </footer>
    </div>
  );
}
