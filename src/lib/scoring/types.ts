export type TestId = "face" | "arm" | "speech";

/**
 * normal       – no sign detected
 * borderline   – weak / uncertain sign; treat with caution
 * abnormal     – clear sign consistent with stroke
 * inconclusive – not enough good-quality data to judge
 */
export type Finding = "normal" | "borderline" | "abnormal" | "inconclusive";

export type Side = "left" | "right";

export interface TestResult {
  test: TestId;
  finding: Finding;
  /** 0..1 severity, used for visualisation only. Decisions use `finding`. */
  score: number;
  /** The person's own side that appears weaker (not the mirrored screen side). */
  weakerSide?: Side;
  /** Plain-language explanation of why this finding was produced. */
  summary: string;
  /** Raw measured values, shown in the clinician handoff report. */
  metrics: Record<string, number>;
  quality: {
    validSamples: number;
    totalSamples: number;
    notes: string[];
  };
}

export function inconclusive(test: TestId, summary: string, notes: string[] = []): TestResult {
  return {
    test,
    finding: "inconclusive",
    score: 0,
    summary,
    metrics: {},
    quality: { validSamples: 0, totalSamples: 0, notes },
  };
}
