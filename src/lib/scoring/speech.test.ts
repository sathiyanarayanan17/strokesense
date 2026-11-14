import { describe, expect, it } from "vitest";
import {
  detectVoiceActivity,
  scoreSpeech,
  TARGET_SENTENCE,
  wordErrorRate,
  type EnergySample,
} from "@/lib/scoring/speech";

/** Builds an energy trace (every 20 ms) from [startMs, endMs] voiced intervals. */
function energy(voiced: Array<[number, number]>, totalMs = 4000): EnergySample[] {
  const out: EnergySample[] = [];
  for (let t = 0; t <= totalMs; t += 20) {
    const on = voiced.some(([a, b]) => t >= a && t <= b);
    out.push({ t, rms: on ? 0.2 : 0.005 });
  }
  return out;
}

const fluent = energy([[500, 2500]]);

describe("wordErrorRate", () => {
  it("is 0 for an exact match, ignoring case and punctuation", () => {
    expect(wordErrorRate(TARGET_SENTENCE, "you CAN'T teach an old dog new tricks.")).toBe(0);
  });
  it("counts substitutions and deletions", () => {
    expect(wordErrorRate(TARGET_SENTENCE, "you can teach old dog tricks")).toBeCloseTo(3 / 8);
  });
});

describe("detectVoiceActivity", () => {
  it("finds pauses inside speech", () => {
    const va = detectVoiceActivity(energy([[500, 1000], [1800, 2300]]), 0.005);
    expect(va.pauseCount).toBe(1);
    expect(va.longestPauseMs).toBeGreaterThanOrEqual(780);
    expect(va.pauseRatio).toBeGreaterThan(0.4);
  });
  it("reports silence", () => {
    expect(detectVoiceActivity(energy([]), 0.005).voicedMs).toBe(0);
  });
});

describe("scoreSpeech", () => {
  it("rates a clear repetition as normal", () => {
    const r = scoreSpeech({ transcript: "you can't teach an old dog new tricks", energy: fluent, noiseFloor: 0.005 });
    expect(r.finding).toBe("normal");
  });

  it("flags garbled speech as abnormal", () => {
    const r = scoreSpeech({ transcript: "you teach old sticks", energy: fluent, noiseFloor: 0.005 });
    expect(r.finding).toBe("abnormal");
  });

  it("always respects a bystander who heard a problem", () => {
    const r = scoreSpeech({ transcript: TARGET_SENTENCE, energy: fluent, noiseFloor: 0.005, bystander: "yes" });
    expect(r.finding).toBe("abnormal");
  });

  it("is inconclusive with no speech and no bystander input", () => {
    expect(scoreSpeech({ transcript: "", energy: energy([]), noiseFloor: 0.005 }).finding).toBe("inconclusive");
  });

  it("uses the bystander answer when transcription is unavailable", () => {
    const r = scoreSpeech({ transcript: null, energy: fluent, noiseFloor: 0.005, bystander: "no" });
    expect(r.finding).toBe("normal");
  });

  it("flags heavily broken-up speech even if the words are right", () => {
    const choppy = energy([[200, 500], [1100, 1300], [1900, 2100], [2700, 3000]]);
    const r = scoreSpeech({ transcript: TARGET_SENTENCE, energy: choppy, noiseFloor: 0.005 });
    expect(r.finding).toBe("borderline");
  });
});
