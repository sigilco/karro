// Cloudflare Workers entry — all /v1 state lives in a single Durable Object
// (the 30-min velocity ring needs one consistent writer). A 1-minute cron
// trigger hits the DO's internal poll endpoint, matching the node server's
// setInterval cadence. State is persisted to DO storage after each poll so
// hibernation doesn't lose observation history.

/// <reference types="@cloudflare/workers-types" />

import { createApiApp, createFeedState, pollOnce, restoreState, serializeState } from "./core";
import type { FeedState as ApiState } from "./core";

interface Env {
  FEED: DurableObjectNamespace;
}

const SINGLETON = "malaga";

export class FeedDO implements DurableObject {
  private state: ApiState = createFeedState();
  private app: ReturnType<typeof createApiApp>;

  constructor(
    private ctx: DurableObjectState,
    _env: Env,
  ) {
    this.app = createApiApp(this.state);
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<string>("feedState");
      if (!stored) return;
      // Restore into the SAME object the app captured.
      const r = restoreState(stored);
      this.state.startMs = r.startMs;
      this.state.ring = r.ring;
      this.state.lastGoodPollMs = r.lastGoodPollMs;
      this.state.lastPollSnapshot = r.lastPollSnapshot;
      this.state.observedMax = r.observedMax;
      this.state.perIdLastSeen = r.perIdLastSeen;
      this.state.observationsTotal = r.observationsTotal;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/v1/internal/poll") {
      try {
        await pollOnce(this.state);
        this.ctx.storage.put("feedState", serializeState(this.state));
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json({ ok: false, error: String(err) }, { status: 502 });
      }
    }
    return this.app.fetch(request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.FEED.get(env.FEED.idFromName(SINGLETON));
    return stub.fetch(request);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const stub = env.FEED.get(env.FEED.idFromName(SINGLETON));
    ctx.waitUntil(stub.fetch("https://do.internal/v1/internal/poll"));
  },
} satisfies ExportedHandler<Env>;
