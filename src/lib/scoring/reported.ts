import type { TestResult } from "./types";

/**
 * Balance ("B") and Eyes ("E") of BE-FAST, reported by the bystander.
 * Sudden loss of balance or vision is hard to measure reliably with a phone in
 * an emergency, so we ask directly. "Yes" is always treated as a warning sign.
 */

export type ReportedAnswer = "yes" | "no" | "unsure";
export type ReportedTest = "balance" | "eyes";

const SUMMARIES: Record<ReportedTest, Record<ReportedAnswer, string>> = {
  balance: {
    yes: "Sudden loss of balance, dizziness or trouble walking was reported.",
    no: "No sudden balance problem was reported.",
    unsure: "It is not known whether there was a sudden balance problem.",
  },
  eyes: {
    yes: "Sudden vision loss, blurred or double vision was reported.",
    no: "No sudden vision problem was reported.",
    unsure: "It is not known whether there was a sudden vision problem.",
  },
};

export function scoreReported(test: ReportedTest, answer: ReportedAnswer): TestResult {
  const finding = answer === "yes" ? "abnormal" : answer === "no" ? "normal" : "inconclusive";
  return {
    test,
    finding,
    score: answer === "yes" ? 1 : 0,
    summary: SUMMARIES[test][answer],
    metrics: {},
    quality: {
      validSamples: 1,
      totalSamples: 1,
      notes: ["Reported by the person or bystander."],
    },
  };
}

const SEVERITY: Record<TestResult["finding"], number> = { inconclusive: 0, normal: 1, borderline: 2, abnormal: 3 };

/**
 * Combines two results for the same BE-FAST item (e.g. what the bystander
 * reported and what the camera measured). The more severe finding wins; an
 * inconclusive part never hides the other part.
 */
export function mergeResults(a: TestResult, b: TestResult): TestResult {
  if (a.test !== b.test) throw new Error(`cannot merge ${a.test} with ${b.test}`);
  const [hi, lo] = SEVERITY[a.finding] >= SEVERITY[b.finding] ? [a, b] : [b, a];
  return {
    test: a.test,
    finding: hi.finding,
    score: Math.max(a.score, b.score),
    weakerSide: hi.weakerSide ?? lo.weakerSide,
    summary: `${hi.summary} ${lo.summary}`.slice(0, 300),
    metrics: { ...lo.metrics, ...hi.metrics },
    quality: {
      validSamples: a.quality.validSamples + b.quality.validSamples,
      totalSamples: a.quality.totalSamples + b.quality.totalSamples,
      notes: [...new Set([...hi.quality.notes, ...lo.quality.notes])],
    },
  };
}
