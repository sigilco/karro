// Drive-mode voice deltas. speechSynthesis must be unlocked by a user
// gesture, so enabling happens in a click handler; deltas are then spoken
// only when the situation actually changes (never a running narration).

let enabled = false;
let lastSignature: string | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;

export function setVoiceEnabled(next: boolean) {
  enabled = next;
  if (!next && typeof speechSynthesis !== "undefined") {
    speechSynthesis.cancel();
  }
}

export function voiceEnabled(): boolean {
  return enabled;
}

// Called during render with the current situation signature; speaks only on
// change. The utterance is scheduled, never synchronous in render — a
// StrictMode double-render hits the signature guard, not the speakers.
export function announceDelta(signature: string, text: string) {
  if (!enabled || typeof speechSynthesis === "undefined") return;
  if (signature === lastSignature) return;
  lastSignature = signature;
  if (pending !== undefined) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    speechSynthesis.speak(utterance);
  }, 400);
}

export function resetDeltaSignature() {
  lastSignature = undefined;
}

export function speakNow(text: string) {
  if (typeof speechSynthesis === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  speechSynthesis.speak(utterance);
}
