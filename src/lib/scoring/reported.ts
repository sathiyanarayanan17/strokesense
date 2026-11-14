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
