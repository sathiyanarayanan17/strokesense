import { describe, expect, it } from "vitest";
import { mergeResults, scoreReported } from "@/lib/scoring/reported";
import { assessRisk } from "@/lib/scoring/risk";
import type { TestResult } from "@/lib/scoring/types";

const measured = (finding: TestResult["finding"]): TestResult => ({
  test: "balance",
  finding,
  score: 0.5,
  summary: "Camera summary.",
  metrics: { swayRms: 0.05 },
  quality: { validSamples: 100, totalSamples: 110, notes: ["camera note"] },
});

describe("mergeResults", () => {
  it("keeps the more severe finding", () => {
    expect(mergeResults(scoreReported("balance", "no"), measured("abnormal")).finding).toBe("abnormal");
    expect(mergeResults(scoreReported("balance", "yes"), measured("normal")).finding).toBe("abnormal");
  });
  it("an inconclusive part never hides the other part", () => {
    expect(mergeResults(scoreReported("balance", "unsure"), measured("borderline")).finding).toBe("borderline");
    expect(mergeResults(scoreReported("balance", "no"), measured("inconclusive")).finding).toBe("normal");
  });
  it("combines metrics, notes and summaries", () => {
    const m = mergeResults(scoreReported("balance", "no"), measured("borderline"));
    expect(m.metrics.swayRms).toBe(0.05);
    expect(m.summary).toContain("Camera summary.");
    expect(m.quality.notes).toContain("camera note");
  });
  it("refuses to merge different tests", () => {
    expect(() => mergeResults(scoreReported("eyes", "no"), measured("normal"))).toThrow();
  });
});

describe("scoreReported", () => {
  it("maps answers to findings", () => {
    expect(scoreReported("balance", "yes").finding).toBe("abnormal");
    expect(scoreReported("eyes", "no").finding).toBe("normal");
    expect(scoreReported("eyes", "unsure").finding).toBe("inconclusive");
  });

  it("a reported vision loss alone triggers the emergency tier", () => {
    expect(assessRisk([scoreReported("eyes", "yes")]).tier).toBe("emergency");
  });
});
