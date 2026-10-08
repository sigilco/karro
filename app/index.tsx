import { useState } from "react";
import type { JSX } from "react";
import { Link } from "one";
import { api } from "~/packages/contract/src/client";
import { getClientId } from "~/components/flows/clientId";
import { Button, Card, ThemeToggle } from "~/packages/ui";

// /install is a placeholder anchor until TestFlight / Play internal exist.
// Plain <a>, not Link — it is not a generated route yet.
const INSTALL_IOS = "/install#ios";
const INSTALL_ANDROID = "/install#android";

const COUNTRIES = [
  { code: "ES", label: "Spain" },
  { code: "PT", label: "Portugal" },
  { code: "FR", label: "France" },
  { code: "IT", label: "Italy" },
  { code: "DE", label: "Germany" },
  { code: "UK", label: "United Kingdom" },
  { code: "US", label: "United States" },
  { code: "OTHER", label: "Somewhere else" },
];

export default function LandingPage(): JSX.Element {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6">
        <header className="flex items-center justify-between py-6">
          <span className="text-sm font-bold tracking-widest">KARRO</span>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 flex-col items-center gap-10 py-6 md:flex-row md:items-center md:gap-14">
          <div className="w-full max-w-md">
            <h1 className="text-5xl font-black tracking-tight">Karro</h1>
            <p className="mt-3 text-xl leading-snug text-ink">
              Parking that'll still be there when you arrive.
            </p>
            <p className="mt-2 text-sm text-ink-dim">
              Live now in Málaga — garages + street zones. More cities soon.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/map"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-6 text-base font-bold text-surface transition-transform active:scale-[0.98]"
              >
                Run app (web) <span aria-hidden="true">→</span>
              </Link>
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={INSTALL_IOS}
                  aria-disabled="true"
                  className="flex h-14 flex-col items-center justify-center rounded-2xl border border-ink-dim/25 bg-surface-2 text-ink opacity-60"
                >
                  <span className="text-sm font-semibold">Install on iOS</span>
                  <span className="text-[11px] text-ink-dim">TestFlight soon</span>
                </a>
                <a
                  href={INSTALL_ANDROID}
                  aria-disabled="true"
                  className="flex h-14 flex-col items-center justify-center rounded-2xl border border-ink-dim/25 bg-surface-2 text-ink opacity-60"
                >
                  <span className="text-sm font-semibold">Install on Android</span>
                  <span className="text-[11px] text-ink-dim">APK / Play internal soon</span>
                </a>
              </div>
            </div>

            <IntentForm />
          </div>

          <PhonePreview />
        </main>

        <footer className="py-6 text-center text-xs text-ink-dim">
          No accounts · no tracking — a Málaga parking POC
        </footer>
      </div>
    </div>
  );
}

// ── "Bring Karro here" intent form ──────────────────────────────────────────
// One vote per submit; the API rows feed the which-city-next decision.

function IntentForm(): JSX.Element {
  const [country, setCountry] = useState("ES");
  const [city, setCity] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(): Promise<void> {
    setState("sending");
    try {
      await api.postIntent({
        country,
        city: city.trim() === "" ? undefined : city.trim(),
        clientId: getClientId(),
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <Card className="mt-8">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Where should Karro come next?
      </div>
      {state === "done" ? (
        <p className="py-3 text-sm text-ink">Thanks — noted.</p>
      ) : (
        <form
          className="mt-3 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Country"
            className="h-11 flex-1 rounded-xl border border-ink/10 bg-surface px-3 text-sm text-ink"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (optional)"
            aria-label="City (optional)"
            maxLength={120}
            className="h-11 flex-1 rounded-xl border border-ink/10 bg-surface px-3 text-sm text-ink placeholder:text-ink-dim"
          />
          <Button type="submit" disabled={state === "sending"} className="h-11">
            {state === "sending" ? "Sending…" : "Vote"}
          </Button>
        </form>
      )}
      {state === "error" ? (
        <p className="mt-2 text-xs text-hard">Couldn't save that — try again.</p>
      ) : undefined}
    </Card>
  );
}

// ── Animated phone preview ───────────────────────────────────────────────────
// Four stylized app states on one 12s CSS cycle (map → ETA difficulty →
// glance → parked). See .karro-screen in global.css.

function PhonePreview(): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[9/19] w-[240px] overflow-hidden rounded-[2.6rem] border-[5px] border-ink/15 bg-surface-2 shadow-2xl">
        <div className="absolute inset-x-0 top-2 z-10 mx-auto h-5 w-20 rounded-full bg-surface" />
        <PreviewMap />
        <PreviewEta />
        <PreviewGlance />
        <PreviewParked />
      </div>
      <div className="flex gap-2" aria-hidden="true">
        <span className="karro-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="karro-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="karro-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="karro-dot h-1.5 w-1.5 rounded-full bg-accent" />
      </div>
      <span className="text-[11px] text-ink-dim">drive mode · live demo</span>
    </div>
  );
}

function PreviewMap(): JSX.Element {
  return (
    <div className="karro-screen flex flex-col bg-surface p-3 pt-10">
      <div className="relative flex-1 overflow-hidden rounded-2xl bg-surface-2">
        {/* stylized street grid */}
        <div className="absolute inset-x-0 top-[28%] h-px bg-ink/10" />
        <div className="absolute inset-x-0 top-[58%] h-px bg-ink/10" />
        <div className="absolute inset-x-0 top-[82%] h-px bg-ink/10" />
        <div className="absolute inset-y-0 left-[24%] w-px bg-ink/10" />
        <div className="absolute inset-y-0 left-[58%] w-px bg-ink/10" />
        <div className="absolute left-[30%] top-[30%] h-[52%] w-1 -rotate-[24deg] rounded bg-accent/25" />
        {/* pins: easy / medium / hard */}
        <Pin className="left-[18%] top-[38%]" tone="bg-easy" ring />
        <Pin className="left-[62%] top-[22%]" tone="bg-easy" ring />
        <Pin className="left-[70%] top-[62%]" tone="bg-medium" />
        <Pin className="left-[30%] top-[72%]" tone="bg-hard" />
        {/* you-are-here dot */}
        <div className="absolute left-[46%] top-[48%] h-3 w-3 rounded-full border-2 border-surface bg-accent shadow" />
      </div>
      <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-dim">Nearest</div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-ink">Almanzor</span>
          <span className="font-semibold text-easy">24 free</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-ink">Tejón y Rodríguez</span>
          <span className="font-semibold text-medium">7 free</span>
        </div>
      </div>
    </div>
  );
}

function Pin(props: { className: string; tone: string; ring?: boolean }): JSX.Element {
  return (
    <div className={`absolute ${props.className}`}>
      {props.ring ? (
        <span className={`karro-ping absolute inset-0 rounded-full ${props.tone}`} />
      ) : undefined}
      <span
        className={`relative block h-2.5 w-2.5 rounded-full border border-surface ${props.tone}`}
      />
    </div>
  );
}

function PreviewEta(): JSX.Element {
  return (
    <div className="karro-screen flex flex-col justify-end bg-surface p-3 pt-10">
      <div className="flex-1" />
      <div className="rounded-2xl bg-surface-2 p-4">
        <div className="text-[10px] uppercase tracking-wide text-ink-dim">Difficulty at ETA</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-black text-medium">MEDIUM</span>
          <span className="text-[11px] text-ink-dim">arriving 18:40</span>
        </div>
        <div className="mt-3 flex items-end gap-1.5">
          {[38, 30, 22, 18].map((h, i) => (
            <div
              key={i}
              className="w-5 rounded-sm bg-medium/70"
              style={{ height: `${h}px` }}
            />
          ))}
          <span className="ml-auto text-[10px] text-ink-dim">+5 → +20 min</span>
        </div>
        <div className="mt-3 rounded-lg bg-medium/15 px-2.5 py-1.5 text-[10px] text-medium">
          rain likely at that hour (72%)
        </div>
      </div>
    </div>
  );
}

function PreviewGlance(): JSX.Element {
  return (
    <div className="karro-screen flex flex-col bg-surface p-3 pt-10">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <div className="text-[10px] uppercase tracking-widest text-ink-dim">Nearby now</div>
        <div className="text-6xl font-black text-easy">2</div>
        <div className="text-xs text-ink-dim">garages likely free</div>
        <div className="mt-2 rounded-full bg-surface-2 px-3 py-1 text-[11px] text-ink">
          Almanzor · 142 m →
        </div>
      </div>
      <div className="rounded-2xl bg-easy py-3 text-center text-sm font-bold text-surface">
        GO
      </div>
    </div>
  );
}

function PreviewParked(): JSX.Element {
  return (
    <div className="karro-screen flex flex-col items-center justify-center gap-3 bg-surface p-3 pt-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-easy/15">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" aria-hidden="true">
          <path
            d="m5 13 4 4L19 7"
            stroke="var(--color-easy)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="text-lg font-bold text-ink">Parked</div>
      <div className="text-xs text-ink-dim">
        4 min walk to Almanzor
        <br />
        SARE free until 09:00
      </div>
      <div className="mt-1 rounded-full bg-surface-2 px-3 py-1 text-[10px] text-ink-dim">
        we'll remember the spot
      </div>
    </div>
  );
}
