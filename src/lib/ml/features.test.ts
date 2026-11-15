import { describe, expect, it } from "vitest";
import { SR, utteranceFeatures } from "@/lib/ml/features";
import { predictSlurred, SPEECH_MODEL } from "@/lib/ml/speech-model";
import fixture from "@/lib/ml/features.fixture.json";
import reference from "@/lib/ml/speech-model.reference.json";

/** Same deterministic signal as `fixture_signal()` in ml/features.py. */
function fixtureSignal(): Float64Array {
  const n = Math.round(1.6 * SR);
  return Float64Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    let tone = 0.4 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t));
    tone += 0.15 * Math.sin(2 * Math.PI * (900 + 400 * t) * t);
    const gate = (t > 0.2 && t < 0.7) || (t > 0.95 && t < 1.4);
    return gate ? tone : 0.0005 * Math.sin(2 * Math.PI * 50 * t);
  });
}

describe("speech features (parity with Python)", () => {
  it("matches every feature computed by ml/features.py", () => {
    const f = utteranceFeatures(fixtureSignal(), 3)!;
    expect(f).not.toBeNull();
    const expected = fixture as Record<string, number>;
    expect(Object.keys(f).sort()).toEqual(Object.keys(expected).sort());
    for (const [k, v] of Object.entries(expected)) {
      const tol = 1e-6 * Math.max(1, Math.abs(v));
      expect(Math.abs(f[k] - v), `${k}: ts=${f[k]} py=${v}`).toBeLessThan(tol);
    }
  });

  it("returns null for silence", () => {
    expect(utteranceFeatures(new Float64Array(SR))).toBeNull();
  });
});

describe("speech model (parity with scikit-learn)", () => {
  it("reproduces the trained model's probabilities", () => {
    reference.inputs.forEach((input, i) => {
      expect(predictSlurred(input as Record<string, number>)).toBeCloseTo(reference.probs[i], 6);
    });
  });

  it("returns null when a feature is missing", () => {
    expect(predictSlurred({})).toBeNull();
  });

  it("ships with held-out metrics", () => {
    expect(SPEECH_MODEL.features.length).toBeGreaterThan(0);
    expect(SPEECH_MODEL.metrics.auc).toBeGreaterThan(0.5);
  });
});
