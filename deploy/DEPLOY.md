# Karro deploy runbook

Coordinator-facing notes for shipping the POC on one box. Target shape: a
single Caddy in front of two processes — the One app (`:3000`) and the FastAPI
shim (`:8791`).

## Two ways to serve the web app

**A. Node — `pnpm serve` (recommended for the POC).**
`pnpm build` emits `dist/` with a Node (Hono) server. Run:

```sh
cd karro
ONE_PUBLIC_API_URL="" pnpm build   # same-origin: Caddy proxies /v1/* to the shim
pnpm serve                          # binds :3000
```

Use same-origin (`ONE_PUBLIC_API_URL=""`) when Caddy routes `/v1/*` to the shim
— no CORS, no baked absolute URL. This is the layout below.

**B. Fully static — `dist/client/`.**
The client bundle is self-contained (`index.html`, `share.html`, `assets/`,
`sw.js`, `manifest.webmanifest`, `icons/`). Push `dist/client/` to any static
host. The API base must then be absolute and CORS-enabled:

```sh
ONE_PUBLIC_API_URL=https://karro-api.example.com pnpm build
```

and the shim must return `Access-Control-Allow-Origin` for that origin
(prefer same-origin proxying — option A — to skip CORS entirely).

## Shim

- Source: `apps/shim/` (see `apps/shim/README.md`); containerfile at
  `apps/shim/Dockerfile`.
- Env vars: **none required**. It reads the public Málaga feeds +
  OSRM/Nominatim upstreams directly.
- Runs on `:8791` by convention below.
- `GET /v1/health` is the liveness endpoint (`{ok, feedAgeS, observations, uptimeS}`).

## Single-box layout

```
            ┌───────────┐
  :443 ───▶ │   Caddy   │
            └─────┬─────┘
        /      ───┼───▶ 127.0.0.1:3000  one serve (dist/)
        /v1/*  ───┴───▶ 127.0.0.1:8791  apps/shim (Dockerfile or uvicorn)
```

Caddyfile — API first, everything else to the app:

```caddy
karro.example.com {
    handle /v1/* {
        reverse_proxy 127.0.0.1:8791
    }
    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

## Build-time env

- `ONE_PUBLIC_API_URL` — baked into the client at `pnpm build` time
  (envPrefix `ONE_PUBLIC_` in `vite.config.ts`). `""` → same-origin `/v1/*`.
- `ONE_SERVER_URL` — optional; canonical origin used for absolute URLs in
  SSG/metadata. Set it to `https://karro.example.com` for prod builds to
  silence the build warning.

## Roll-forward

```sh
git pull
pnpm install
ONE_PUBLIC_API_URL="" ONE_SERVER_URL=https://karro.example.com pnpm build
systemctl --user restart karro-web   # or pm2 restart karro-web
docker compose up -d --build shim    # or systemd unit for apps/shim
```

Verify: `curl https://karro.example.com/v1/health` → `{ok:true,…}` and
`curl -I https://karro.example.com/share` → 200.

## POC caveats for ops

- `sw.js` precaches `/` and the manifest; API responses only serve from cache
  when <30s old. Bump `VERSION` in `public/sw.js` if precache behavior changes.
- No auth anywhere — do not expose the shim on a public port without the
  Caddy path rule above.
- Upstream calls (OSRM demo, Nominatim, datosabiertos) are free tiers; the
  shim must send a real User-Agent for Nominatim.
