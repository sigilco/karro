import type { BadgeTone } from "~/packages/ui";

// Difficulty verdict for "spaces at arrival". Thresholds are POC-tunable:
// ≥8 projected spaces feels safe in Málaga garage terms, 3–7 is a gamble,
// <3 is effectively full.
export type Verdict = "EASY" | "MEDIUM" | "HARD";

export function verdictForProjected(projected: number): Verdict {
  if (projected >= 8) return "EASY";
  if (projected >= 3) return "MEDIUM";
  return "HARD";
}

export function toneForVerdict(verdict: Verdict): BadgeTone {
  if (verdict === "EASY") return "easy";
  if (verdict === "MEDIUM") return "medium";
  return "hard";
}
