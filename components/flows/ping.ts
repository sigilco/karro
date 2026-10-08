// Arrival ping — a short two-tone chime when the driver closes in on the
// target, plus a once-per-drive guard so it can't spam on GPS jitter.
// WebAudio only; no asset files, works in PWA and native webview.

let ctx: AudioContext | undefined;
const fired = new Set<string>();

function tone(ac: AudioContext, freq: number, start: number, dur: number, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function playArrivalChime(): void {
  if (typeof window === "undefined") return;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    tone(ctx, 523.25, t0, 0.35, 0.22); // C5
    tone(ctx, 783.99, t0 + 0.16, 0.55, 0.18); // G5 — rising fifth, reads as "arriving"
  } catch {
    // no audio device — silent skip
  }
}

/** true once per key until resetPing — used for "fired once per drive". */
export function pingOnce(key: string): boolean {
  if (fired.has(key)) return false;
  fired.add(key);
  return true;
}

export function resetPing(key: string): void {
  fired.delete(key);
}
