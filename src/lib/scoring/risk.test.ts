import { describe, expect, it } from "vitest";
import { assessRisk, describeOnset } from "@/lib/scoring/risk";
import type { Finding, TestId, TestResult } from "@/lib/scoring/types";

const r = (test: TestId, finding: Finding): TestResult => ({
  test,
  finding,
  score: 0,
  summary: "",
  metrics: {},
  quality: { validSamples: 0, totalSamples: 0, notes: [] },
});

describe("assessRisk", () => {
  it("escalates on any single positive sign", () => {
    const a = assessRisk([r("face", "normal"), r("arm", "abnormal"), r("speech", "normal")]);
    expect(a.tier).toBe("emergency");
    expect(a.positiveTests).toEqual(["arm"]);
  });
  it("positive beats inconclusive", () => {
    expect(assessRisk([r("face", "abnormal"), r("arm", "inconclusive")]).tier).toBe("emergency");
  });
  it("reports possible signs for borderline", () => {
    expect(assessRisk([r("face", "borderline"), r("arm", "normal")]).tier).toBe("possible");
  });
  it("never reports all-clear when a test could not be completed", () => {
    expect(assessRisk([r("face", "normal"), r("arm", "inconclusive")]).tier).toBe("inconclusive");
    expect(assessRisk([]).tier).toBe("inconclusive");
  });
  it("reports no signs only when every test is normal", () => {
    expect(assessRisk([r("face", "normal"), r("arm", "normal"), r("speech", "normal")]).tier).toBe("no-signs");
  });
});

describe("describeOnset", () => {
  const now = Date.parse("2026-11-12T10:00:00Z");
  it("formats elapsed time and flags the early window", () => {
    const o = describeOnset("2026-11-12T08:30:00Z", now)!;
    expect(o.label).toBe("1 h 30 min ago");
    expect(o.message).toMatch(/early window/);
  });
  it("handles unknown onset", () => {
    expect(describeOnset(null, now)).toBeNull();
    expect(describeOnset("not a date", now)).toBeNull();
  });
});
