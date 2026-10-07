# Karro

Parking that'll still be there. A parking-availability POC for Málaga, Spain —
live garage occupancy, SARE zone rules, and a difficulty forecast you can share
before you drive.

## Stack

- **One** (onestack.dev) — universal app, file-system routes, `one serve` (Hono on Node) for production web
- **Tailwind v4** — all styling via utility classes; theme tokens in `app/global.css`
- **Python FastAPI shim** (`apps/shim/`) — scrapes/caches the Málaga open-data feeds and serves `/v1/*`
- **`@karro/contract`** (`packages/contract`) — Valibot wire schemas shared by shim and client

## Develop

```sh
pnpm install
pnpm dev          # web dev server
```

Point the app at a running shim with `ONE_PUBLIC_API_URL` (empty string = same
origin, i.e. shim behind the same reverse proxy):

```sh
ONE_PUBLIC_API_URL=http://localhost:8791 pnpm dev
```

## Production (web)

```sh
ONE_PUBLIC_API_URL=https://api.example.com pnpm build
pnpm serve        # serves dist/ on Node, default :3000
```

`dist/client` is also a fully static bundle — it can be hosted on any static
host/CDN as long as `/v1/*` reaches the shim (same-origin proxy or an absolute
`ONE_PUBLIC_API_URL` baked at build time).

## Shim

See `apps/shim/README.md`. It needs no env vars or secrets and ships a
`apps/shim/Dockerfile`. Deploy notes live in `deploy/DEPLOY.md`.

## PWA

`public/manifest.webmanifest` + hand-written `public/sw.js` (registered by
`public/register-sw.js`, loaded from `app/_layout.tsx`). Icons in
`public/icons/`. The shareable forecast page is `app/share+ssg.tsx` at
`/share?city=…&date=YYYY-MM-DD`.

## POC caveats

- Single city (Málaga); zones are **inferred**, not digitized curb data.
- No auth, no payments, no real-time guarantees — feeds are best-effort.
- Service worker caches API responses for at most 30s; treat offline data as stale.
