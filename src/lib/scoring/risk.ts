import type { TestId, TestResult } from "./types";

/**
 * Combines the individual tests into one recommendation.
 *
 * Design choice: this is a deterministic rule engine, not a black-box model.
 * Following BE-FAST / Cincinnati guidance, ANY single positive sign is enough
 * to call emergency services. The tool is tuned to avoid missing a stroke;
 * a false alarm costs far less than a missed one.
 */

export type RiskTier = "emergency" | "possible" | "inconclusive" | "no-signs";

export interface RiskAssessment {
  tier: RiskTier;
  headline: string;
  advice: string;
  positiveTests: TestId[];
  borderlineTests: TestId[];
  inconclusiveTests: TestId[];
}

export function assessRisk(results: TestResult[]): RiskAssessment {
  const by = (f: TestResult["finding"]) => results.filter((r) => r.finding === f).map((r) => r.test);
  const positiveTests = by("abnormal");
  const borderlineTests = by("borderline");
  const inconclusiveTests = by("inconclusive");
  const base = { positiveTests, borderlineTests, inconclusiveTests };

  if (positiveTests.length > 0) {
    return {
      ...base,
      tier: "emergency",
      headline: "Warning signs of stroke detected",
      advice: "Call emergency services now. Say \"suspected stroke\" and give the time the person was last seen well.",
    };
  }
  if (borderlineTests.length > 0) {
    return {
      ...base,
      tier: "possible",
      headline: "Possible warning signs",
      advice: "Do not wait to see if it gets better. Call emergency services and mention a possible stroke.",
    };
  }
  if (inconclusiveTests.length > 0 || results.length === 0) {
    return {
      ...base,
      tier: "inconclusive",
      headline: "Some checks could not be completed",
      advice:
        "If you notice ANY sudden face drooping, arm weakness, speech trouble, vision loss or loss of balance, call emergency services immediately.",
    };
  }
  return {
    ...base,
    tier: "no-signs",
    headline: "No warning signs detected",
    advice:
      "This check cannot rule out a stroke. If symptoms appear, return, or you are worried, call emergency services anyway.",
  };
}

export interface OnsetInfo {
  hoursSince: number;
  label: string;
  message: string;
}

/** `lastKnownWell` is an ISO timestamp or null if unknown. `now` is passed in to keep this pure. */
export function describeOnset(lastKnownWell: string | null, now: number): OnsetInfo | null {
  if (!lastKnownWell) return null;
  const t = Date.parse(lastKnownWell);
  if (Number.isNaN(t)) return null;
  const hoursSince = Math.max(0, (now - t) / 3_600_000);
  const h = Math.floor(hoursSince);
  const m = Math.floor((hoursSince - h) * 60);
  const label = h > 0 ? `${h} h ${m} min ago` : `${m} min ago`;
  const message =
    hoursSince <= 4.5
      ? "Still within the early window when clot-dissolving treatment may be possible. Every minute counts."
      : hoursSince <= 24
        ? "Some treatments may still be possible. Get to hospital without delay."
        : "Tell the medical team exactly when symptoms began.";
  return { hoursSince, label, message };
}
