// Node entry — `node src/index.ts` (Node ≥23.6 runs TS directly).
// For the Cloudflare Workers deployment see ./worker.ts.

import { serve } from '@hono/node-server'
import { createApiApp, createFeedState, pollOnce, POLL_INTERVAL_MS } from './core'

const state = createFeedState()
const app = createApiApp(state)

const tick = async () => {
  try {
    await pollOnce(state)
  } catch (err) {
    console.warn('[karro-api] SMASSA poll failed, serving last-good data:', err)
  }
}
void tick()
// DOM lib types setInterval as returning number; under node it's a Timeout.
;(setInterval(tick, POLL_INTERVAL_MS) as unknown as { unref(): void }).unref()

const port = Number(process.env.PORT ?? 8791)
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[karro-api] listening on :${info.port}`)
})

export default app
