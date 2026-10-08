// Stable anonymous client id for telemetry grouping (park/depart chains).
let cached: string | undefined;

export function getClientId(): string {
  if (cached) return cached;
  try {
    const stored = window.localStorage.getItem("karro_cid");
    if (stored) {
      cached = stored;
      return stored;
    }
    const id = crypto.randomUUID();
    window.localStorage.setItem("karro_cid", id);
    cached = id;
    return id;
  } catch {
    return "anon";
  }
}
