import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreArms, ARM_THRESHOLDS } from "../lib/scoring/arm";
import { scoreFace, FACE_THRESHOLDS } from "../lib/scoring/face";
import type { Finding, TestResult } from "../lib/scoring/types";
import { rng, simulateArms, simulateFace, wilson, type Rng } from "./simulate";

/**
 * Run with `npm run eval`. Writes docs/EVALUATION.md.
 * "Flagged" = abnormal OR borderline, because the app escalates on either.
 */

const N = 400; // simulated subjects per condition and class
const SEED = 20261114;

const flagged = (f: Finding) => f === "abnormal" || f === "borderline";
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ci = (s: number, n: number) => {
  const [lo, hi] = wilson(s, n);
  return `${pct(s / n)} (${pct(lo)}–${pct(hi)})`;
};

interface Row {
  condition: string;
  sens: string;
  spec: string;
  inconclusive: string;
  sideCorrect: string;
  raw: { tp: number; pos: number; tn: number; neg: number };
}

function evaluate(
  condition: string,
  makePositive: (r: Rng) => { result: TestResult; side: "left" | "right" },
  makeNegative: (r: Rng) => TestResult,
  seed: number,
): Row {
  const r = rng(seed);
  let tp = 0;
  let sideOk = 0;
  let tn = 0;
  let inc = 0;
  for (let i = 0; i < N; i++) {
    const { result, side } = makePositive(r);
    if (result.finding === "inconclusive") inc++;
    if (flagged(result.finding)) {
      tp++;
      if (result.weakerSide === side) sideOk++;
    }
    const neg = makeNegative(r);
    if (neg.finding === "inconclusive") inc++;
    if (!flagged(neg.finding)) tn++;
  }
  return {
    condition,
    sens: ci(tp, N),
    spec: ci(tn, N),
    inconclusive: pct(inc / (2 * N)),
    sideCorrect: tp ? pct(sideOk / tp) : "—",
    raw: { tp, pos: N, tn, neg: N },
  };
}

const side = (r: Rng) => (r.next() < 0.5 ? "left" : "right") as "left" | "right";

// Face conditions: positives have moderate-to-severe one-sided weakness (40–90%),
// negatives have natural asymmetry (0–10%).
const FACE_CONDITIONS = [
  { name: "Ideal (no noise, frontal)", jitter: 0, roll: 0, yaw: 0, scale: [1, 1] },
  { name: "Typical phone (1.5 px jitter, ±10° tilt)", jitter: 1.5, roll: 10, yaw: 6, scale: [0.7, 1.3] },
  { name: "Hard (3 px jitter, ±20° tilt, far/near)", jitter: 3, roll: 20, yaw: 12, scale: [0.5, 1.5] },
  { name: "Very noisy (5 px jitter)", jitter: 5, roll: 15, yaw: 10, scale: [0.6, 1.4] },
];

const ARM_CONDITIONS = [
  { name: "Ideal (30 fps, low noise)", noise: 0.01, fps: 30, dropout: 0 },
  { name: "Typical phone (20 fps, 3% noise, 10% dropout)", noise: 0.03, fps: 20, dropout: 0.1 },
  { name: "Hard (15 fps, 5% noise, 25% dropout)", noise: 0.05, fps: 15, dropout: 0.25 },
];

function faceRows(): Row[] {
  return FACE_CONDITIONS.map((c, i) => {
    const make = (r: Rng, weakness: number, weakSide: "left" | "right") =>
      scoreFace(
        simulateFace(
          {
            weakness,
            weakSide,
            jitterPx: c.jitter,
            rollDeg: r.uniform(-c.roll, c.roll),
            yawPx: r.uniform(-c.yaw, c.yaw),
            scale: r.uniform(c.scale[0], c.scale[1]),
            smileStrength: r.uniform(0.6, 1.2),
          },
          r,
        ),
      );
    return evaluate(
      c.name,
      (r) => {
        const s = side(r);
        return { result: make(r, r.uniform(0.4, 0.9), s), side: s };
      },
      (r) => make(r, r.uniform(0, 0.1), side(r)),
      SEED + i,
    );
  });
}

function armRows(): Row[] {
  return ARM_CONDITIONS.map((c, i) => {
    const make = (r: Rng, drift: number, weakSide: "left" | "right", fatigue: number) =>
      scoreArms(simulateArms({ drift, weakSide, fatigue, noise: c.noise, fps: c.fps, dropout: c.dropout }, r));
    return evaluate(
      c.name,
      (r) => {
        const s = side(r);
        return { result: make(r, r.uniform(0.25, 0.6), s, r.uniform(0, 0.1)), side: s };
      },
      // Negatives include people whose arms BOTH tire and sink by up to 0.3 shoulder widths.
      (r) => make(r, r.uniform(0, 0.06), side(r), r.uniform(0, 0.3)),
      SEED + 100 + i,
    );
  });
}

/** Detection rate by weakness severity, typical phone conditions. */
function faceSeverityCurve(): Array<{ weakness: string; flagged: string }> {
  const r = rng(SEED + 500);
  return [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.7, 0.9].map((w) => {
    let f = 0;
    for (let i = 0; i < N; i++) {
      const res = scoreFace(
        simulateFace(
          { weakness: w, weakSide: side(r), jitterPx: 1.5, rollDeg: r.uniform(-10, 10), yawPx: r.uniform(-6, 6), scale: r.uniform(0.7, 1.3), smileStrength: r.uniform(0.6, 1.2) },
          r,
        ),
      );
      if (flagged(res.finding)) f++;
    }
    return { weakness: `${Math.round(w * 100)}%`, flagged: pct(f / N) };
  });
}

/** Detection rate by one-sided drift, typical phone conditions, with mild fatigue in both arms. */
function armSeverityCurve(): Array<{ drift: string; flagged: string }> {
  const r = rng(SEED + 600);
  return [0, 0.05, 0.1, 0.12, 0.15, 0.2, 0.25, 0.4].map((d) => {
    let f = 0;
    for (let i = 0; i < N; i++) {
      const res = scoreArms(simulateArms({ drift: d, weakSide: side(r), fatigue: r.uniform(0, 0.15), noise: 0.03, fps: 20, dropout: 0.1 }, r));
      if (flagged(res.finding)) f++;
    }
    return { drift: d.toFixed(2), flagged: pct(f / N) };
  });
}

function table(rows: Row[]): string {
  return [
    "| Condition | Sensitivity (95% CI) | Specificity (95% CI) | Inconclusive | Weaker side correct |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.condition} | ${r.sens} | ${r.spec} | ${r.inconclusive} | ${r.sideCorrect} |`),
  ].join("\n");
}

describe("synthetic robustness evaluation", () => {
  it("generates docs/EVALUATION.md", () => {
    const face = faceRows();
    const arms = armRows();
    const curve = faceSeverityCurve();
    const armCurve = armSeverityCurve();

    const md = `# StrokeSense — synthetic robustness evaluation

Generated by \`npm run eval\` (seed ${SEED}, ${N} simulated positives and ${N} negatives per condition).
Re-running produces identical numbers.

## What this does and does not show

This evaluation feeds the real scoring engine with **simulated landmark data whose ground truth is known**, then
adds the kinds of error a phone camera introduces: per-frame landmark jitter, head tilt, small head turns, varying
camera distance, low frame rate, tremor and lost tracking. It answers: *if the landmarks behave like this, does the
maths still separate one-sided weakness from normal movement?*

It does **not** measure clinical accuracy. Real stroke patients look different from a simulation. A prospective
study (or a labelled dataset such as Toronto NeuroFace for facial palsy) is required before any medical claim.

"Flagged" means the test returned *abnormal* or *borderline*, because the app escalates on either.

## Face (facial droop)

Positives: one side of the mouth moves 40–90% less than the other. Negatives: natural asymmetry of 0–10%.
Smile strength varies from 60% to 120% of a full smile.

${table(face)}

### Detection rate by severity (typical phone conditions)

| One-sided weakness | Flagged |
|---|---|
${curve.map((c) => `| ${c.weakness} | ${c.flagged} |`).join("\n")}

## Arms (pronator drift)

Positives: one arm sinks 0.25–0.6 shoulder widths during the 10 s hold. Negatives: at most 0.06 one-sided drift,
**plus both arms tiring together by up to 0.3 shoulder widths**, to test that fatigue is not mistaken for weakness.

${table(arms)}

### Detection rate by one-sided drift (typical phone conditions)

The well-separated classes above make the arm test look perfect. This curve shows the honest picture near the
threshold (${ARM_THRESHOLDS.driftBorderline} shoulder widths), where mild drift is caught only part of the time.

| One-sided drift (shoulder widths) | Flagged |
|---|---|
${armCurve.map((c) => `| ${c.drift} | ${c.flagged} |`).join("\n")}

## Thresholds under test

- Face: excursion asymmetry ≥ ${FACE_THRESHOLDS.eaiBorderline} borderline, ≥ ${FACE_THRESHOLDS.eaiAbnormal} abnormal; smile droop ≥ ${FACE_THRESHOLDS.droopBorderline} / ${FACE_THRESHOLDS.droopAbnormal} inter-ocular units; frames with head turn > ${FACE_THRESHOLDS.maxYaw} rejected.
- Arms: one-sided drift ≥ ${ARM_THRESHOLDS.driftBorderline} borderline, ≥ ${ARM_THRESHOLDS.driftAbnormal} abnormal (shoulder widths); wrist below ${ARM_THRESHOLDS.raiseFailHeight} at start = arm could not be raised.

Speech is not included: word error rate depends on the browser's speech recogniser, which cannot be meaningfully
simulated. It should be evaluated with recordings (e.g. the TORGO dysarthric speech corpus).
`;
    mkdirSync("docs", { recursive: true });
    writeFileSync("docs/EVALUATION.md", md);
    console.log(md);

    // Sanity floor: under typical conditions the engine should work well.
    const typicalFace = face[1].raw;
    expect(typicalFace.tp / typicalFace.pos).toBeGreaterThan(0.8);
    expect(typicalFace.tn / typicalFace.neg).toBeGreaterThan(0.8);
  });
});
