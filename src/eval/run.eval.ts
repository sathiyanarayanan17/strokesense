import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreArms, ARM_THRESHOLDS } from "../lib/scoring/arm";
import { scoreBalance, BALANCE_THRESHOLDS } from "../lib/scoring/balance";
import { scoreFace, FACE_THRESHOLDS } from "../lib/scoring/face";
import { scoreGaze, GAZE_THRESHOLDS } from "../lib/scoring/gaze";
import type { Finding, TestResult } from "../lib/scoring/types";
import { rng, simulateArms, simulateBalance, simulateFace, simulateGaze, wilson, type Rng } from "./simulate";

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
  makePositive: (r: Rng) => { result: TestResult; side: "left" | "right" | null },
  makeNegative: (r: Rng) => TestResult,
  seed: number,
): Row {
  const r = rng(seed);
  let tp = 0;
  let sideOk = 0;
  let sideN = 0;
  let tn = 0;
  let inc = 0;
  for (let i = 0; i < N; i++) {
    const { result, side } = makePositive(r);
    if (result.finding === "inconclusive") inc++;
    if (flagged(result.finding)) {
      tp++;
      if (side !== null) {
        sideN++;
        if (result.weakerSide === side) sideOk++;
      }
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
    sideCorrect: sideN ? pct(sideOk / sideN) : "—",
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

/** Eyes: detection rate by weak-side movement (as a fraction of the strong side), 2 px iris jitter. */
function gazeSeverityCurve(): Array<{ ratio: string; flagged: string }> {
  const r = rng(SEED + 700);
  return [1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0].map((ratio) => {
    let f = 0;
    for (let i = 0; i < N; i++) {
      const strong = r.uniform(0.15, 0.3);
      const weakLeft = r.next() < 0.5;
      const res = scoreGaze(
        simulateGaze(
          {
            restDeviation: r.gauss(0.03),
            toLeft: weakLeft ? strong * ratio : strong,
            toRight: weakLeft ? strong : strong * ratio,
            irisJitterPx: 2,
            framesPerPhase: 15,
          },
          r,
        ),
      );
      if (flagged(res.finding)) f++;
    }
    return { ratio: `${Math.round(ratio * 100)}%`, flagged: pct(f / N) };
  });
}

/** Balance: positives sway strongly, lean, or step; negatives stand with normal small sway. */
const BALANCE_CONDITIONS = [
  { name: "Typical phone (2 px jitter, 30 fps)", jitter: 2, fps: 30 },
  { name: "Hard (4 px jitter, 15 fps)", jitter: 4, fps: 15 },
];

function balanceRows(): Row[] {
  return BALANCE_CONDITIONS.map((c, i) =>
    evaluate(
      c.name,
      (r) => {
        const kind = r.next();
        const tiltSign = r.next() < 0.5 ? -1 : 1;
        const res = scoreBalance(
          simulateBalance(
            {
              swayAmp: kind < 0.4 ? r.uniform(0.1, 0.18) : r.uniform(0, 0.02),
              swayHz: r.uniform(0.2, 0.6),
              tiltDeg: kind >= 0.4 && kind < 0.75 ? tiltSign * r.uniform(12, 18) : r.uniform(-2, 2),
              stepAtMs: kind >= 0.75 ? r.uniform(3000, 8000) : undefined,
              jitterPx: c.jitter,
              fps: c.fps,
            },
            r,
          ),
        );
        // Only leans have a side.
        const isLean = kind >= 0.4 && kind < 0.75;
        return { result: res, side: isLean ? (tiltSign > 0 ? "left" : "right") : null };
      },
      (r) =>
        scoreBalance(
          simulateBalance(
            { swayAmp: r.uniform(0, 0.025), swayHz: r.uniform(0.1, 0.4), tiltDeg: r.uniform(-3, 3), jitterPx: c.jitter, fps: c.fps },
            r,
          ),
        ),
      SEED + 200 + i,
    ),
  );
}

/** Eyes: positives have a one-sided gaze palsy or resting deviation; negatives move evenly. */
const GAZE_CONDITIONS = [
  { name: "Typical (1 px iris jitter)", jitter: 1 },
  { name: "Noisy (2 px iris jitter)", jitter: 2 },
  { name: "Very noisy (3 px iris jitter)", jitter: 3 },
];

function gazeRows(): Row[] {
  return GAZE_CONDITIONS.map((c, i) =>
    evaluate(
      c.name,
      (r) => {
        const strong = r.uniform(0.15, 0.3);
        const palsy = r.next() < 0.6;
        const weakLeft = r.next() < 0.5;
        const weak = strong * r.uniform(0, 0.25);
        const r0 = (r.next() < 0.5 ? -1 : 1) * r.uniform(0.22, 0.35);
        const res = scoreGaze(
          simulateGaze(
            {
              restDeviation: palsy ? r.gauss(0.02) : r0,
              toLeft: palsy && weakLeft ? weak : strong,
              toRight: palsy && !weakLeft ? weak : strong,
              irisJitterPx: c.jitter,
              framesPerPhase: 15,
            },
            r,
          ),
        );
        return { result: res, side: palsy ? (weakLeft ? "left" : "right") : (r0 > 0 ? "left" : "right") };
      },
      (r) => {
        const base = r.uniform(0.15, 0.3);
        return scoreGaze(
          simulateGaze(
            {
              restDeviation: r.gauss(0.03),
              toLeft: base * r.uniform(0.8, 1),
              toRight: base * r.uniform(0.8, 1),
              irisJitterPx: c.jitter,
              framesPerPhase: 15,
            },
            r,
          ),
        );
      },
      SEED + 300 + i,
    ),
  );
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
    const balance = balanceRows();
    const gaze = gazeRows();
    const gazeCurve = gazeSeverityCurve();

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

## Balance (standing sway)

Positives: strong lateral sway (0.10–0.18 torso lengths), a lean of 12–18°, or a step during the 10 s stand.
Negatives: normal small sway (≤ 0.025 torso lengths) and ≤ 3° posture asymmetry. "Weaker side" applies to leans only.

${table(balance)}

## Eyes (gaze following)

Positives: one-sided gaze palsy (the weak side moves 0–25% as far as the strong side) or resting deviation of
0.22–0.35 eye widths. Negatives: both sides within 20% of each other, small resting offset. Iris jitter is the main
error source for phone cameras; real-world accuracy must be confirmed with recordings.

${table(gaze)}

### Detection rate by weak-side eye movement (2 px iris jitter)

| Weak side moves (% of strong side) | Flagged |
|---|---|
${gazeCurve.map((c) => `| ${c.ratio} | ${c.flagged} |`).join("\n")}

## Thresholds under test

- Face: excursion asymmetry ≥ ${FACE_THRESHOLDS.eaiBorderline} borderline, ≥ ${FACE_THRESHOLDS.eaiAbnormal} abnormal; smile droop ≥ ${FACE_THRESHOLDS.droopBorderline} / ${FACE_THRESHOLDS.droopAbnormal} inter-ocular units; frames with head turn > ${FACE_THRESHOLDS.maxYaw} rejected.
- Arms: one-sided drift ≥ ${ARM_THRESHOLDS.driftBorderline} borderline, ≥ ${ARM_THRESHOLDS.driftAbnormal} abnormal (shoulder widths); wrist below ${ARM_THRESHOLDS.raiseFailHeight} at start = arm could not be raised.
- Balance: sway RMS ≥ ${BALANCE_THRESHOLDS.rmsBorderline} / ${BALANCE_THRESHOLDS.rmsAbnormal} torso lengths (0.5 s low-pass); trunk tilt ≥ ${BALANCE_THRESHOLDS.tiltBorderlineDeg}° / ${BALANCE_THRESHOLDS.tiltAbnormalDeg}°; smoothed ankle movement ≥ ${BALANCE_THRESHOLDS.stepDistance} = a step. Sway *velocity* is reported but no longer used for decisions: an earlier version of this evaluation showed it flagged 100% of healthy simulated people under noisy-camera conditions.
- Eyes: weak/strong excursion ratio < ${GAZE_THRESHOLDS.palsyBorderline} / ${GAZE_THRESHOLDS.palsyAbnormal}; resting deviation ≥ ${GAZE_THRESHOLDS.deviationBorderline} / ${GAZE_THRESHOLDS.deviationAbnormal} eye widths; frames with head turn > ${GAZE_THRESHOLDS.maxHeadYaw} rejected.

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
