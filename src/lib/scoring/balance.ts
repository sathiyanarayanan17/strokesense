import { clamp, dist, median, round, type Vec2 } from "../math";
import type { TestResult } from "./types";

/**
 * Standing balance (the "B" in BE-FAST), measured with body tracking.
 *
 * The person stands still, feet together, arms by their sides, for ~10 s.
 * Stroke affecting the cerebellum or brainstem often causes increased sway, a
 * lean to one side, or a step to stop falling. Units are torso lengths (mid-
 * shoulder to mid-hip), so the measures do not depend on camera distance.
 * The camera sees side-to-side sway only (not forward/back).
 */

export const BALANCE_LANDMARKS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Provisional thresholds. Calibrate against clinical data before any clinical use. */
export const BALANCE_THRESHOLDS = {
  minVisibility: 0.5,
  minFrames: 30,
  minDurationMs: 6000,
  swaySmoothMs: 500, // low-pass: real postural sway is < 1 Hz; landmark jitter is not
  ankleSmoothMs: 300,
  rmsBorderline: 0.04,
  rmsAbnormal: 0.07,
  velocityBorderline: 0.08, // informational only (see scoreBalance)
  velocityAbnormal: 0.15,
  tiltBorderlineDeg: 7,
  tiltAbnormalDeg: 11,
  stepDistance: 0.25, // an ankle moving this far (torso lengths) = a step
};

export interface BalancePoint extends Vec2 {
  visibility?: number;
}

export interface BalanceFrame {
  t: number; // ms since the hold started
  points: BalancePoint[];
}

interface Sample {
  t: number;
  x: number; // trunk centre, lateral, torso lengths
  tiltDeg: number; // + = trunk leans toward the person's left
  lAnkle: Vec2;
  rAnkle: Vec2;
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function toSample(f: BalanceFrame, minVis: number): Sample | null {
  const P = BALANCE_LANDMARKS;
  const pts = [P.leftShoulder, P.rightShoulder, P.leftHip, P.rightHip, P.leftAnkle, P.rightAnkle].map((i) => f.points[i]);
  if (pts.some((p) => !p || (p.visibility ?? 1) < minVis)) return null;
  const [ls, rs, lh, rh, la, ra] = pts;
  const sh = mid(ls, rs);
  const hip = mid(lh, rh);
  const torso = dist(sh, hip);
  if (torso < 1e-6) return null;
  // Unmirrored camera image: the person's left is +x. Tilt of the hip->shoulder line from vertical.
  const tiltDeg = (Math.atan2(sh.x - hip.x, hip.y - sh.y) * 180) / Math.PI;
  const centre = mid(sh, hip);
  return {
    t: f.t,
    x: centre.x / torso,
    tiltDeg,
    lAnkle: { x: la.x / torso, y: la.y / torso },
    rAnkle: { x: ra.x / torso, y: ra.y / torso },
  };
}

/** Centred moving average over a time window, so smoothing is the same at any frame rate. */
export function smoothByTime(values: number[], times: number[], windowMs: number): number[] {
  const half = windowMs / 2;
  let lo = 0;
  let hi = 0;
  let sum = 0;
  return values.map((_, i) => {
    while (hi < values.length && times[hi] <= times[i] + half) sum += values[hi++];
    while (times[lo] < times[i] - half) sum -= values[lo++];
    return sum / (hi - lo);
  });
}

export function scoreBalance(frames: BalanceFrame[]): TestResult {
  const T = BALANCE_THRESHOLDS;
  const notes: string[] = [];
  const samples = frames.map((f) => toSample(f, T.minVisibility)).filter((s): s is Sample => s !== null);
  const duration = samples.length ? samples[samples.length - 1].t - samples[0].t : 0;
  const quality = { validSamples: samples.length, totalSamples: frames.length, notes };

  if (samples.length < T.minFrames || duration < T.minDurationMs) {
    notes.push("The whole body, from shoulders to ankles, was not visible for long enough.");
    return {
      test: "balance",
      finding: "inconclusive",
      score: 0,
      summary: "We could not see the whole body. Place the phone further away so the feet are in view, then retry.",
      metrics: { validFrames: samples.length, durationMs: Math.round(duration) },
      quality,
    };
  }

  const ts = samples.map((s) => s.t);
  const xs = smoothByTime(samples.map((s) => s.x), ts, T.swaySmoothMs);
  const centre = median(xs);
  const rms = Math.sqrt(xs.reduce((a, x) => a + (x - centre) ** 2, 0) / xs.length);
  let path = 0;
  for (let i = 1; i < xs.length; i++) path += Math.abs(xs[i] - xs[i - 1]);
  const velocity = path / (duration / 1000);
  const tilt = median(samples.map((s) => s.tiltDeg));

  // A step: either (smoothed) ankle moves well away from where it started.
  const sm = (k: "lAnkle" | "rAnkle", c: "x" | "y") => smoothByTime(samples.map((s) => s[k][c]), ts, T.ankleSmoothMs);
  const [lx, ly, rx, ry] = [sm("lAnkle", "x"), sm("lAnkle", "y"), sm("rAnkle", "x"), sm("rAnkle", "y")];
  let maxStep = 0;
  for (let i = 0; i < samples.length; i++) {
    maxStep = Math.max(maxStep, Math.hypot(lx[i] - lx[0], ly[i] - ly[0]), Math.hypot(rx[i] - rx[0], ry[i] - ry[0]));
  }
  const stepped = maxStep >= T.stepDistance;

  const metrics = {
    swayRms: round(rms),
    swayVelocity: round(velocity),
    trunkTiltDeg: round(tilt, 1),
    maxAnkleMove: round(maxStep),
    durationMs: Math.round(duration),
  };

  const reasons: string[] = [];
  let finding: TestResult["finding"] = "normal";
  const raise = (f: "borderline" | "abnormal", why: string) => {
    if (f === "abnormal" || finding === "normal") finding = f;
    reasons.push(why);
  };
  if (stepped) raise("abnormal", "they had to step to keep their balance");
  // Sway velocity is reported but not used for decisions: the synthetic evaluation showed it is
  // dominated by landmark jitter on noisy phone cameras (docs/EVALUATION.md). RMS sway is robust.
  if (rms >= T.rmsAbnormal) raise("abnormal", "they swayed strongly");
  else if (rms >= T.rmsBorderline) raise("borderline", "they swayed more than expected");
  const absTilt = Math.abs(tilt);
  const tiltSide = tilt > 0 ? "left" : "right";
  if (absTilt >= T.tiltAbnormalDeg) raise("abnormal", `their body leaned to the ${tiltSide}`);
  else if (absTilt >= T.tiltBorderlineDeg) raise("borderline", `their body leaned slightly to the ${tiltSide}`);

  const summary =
    finding === "normal"
      ? "They stood steadily without leaning."
      : `Possible balance problem: ${reasons.join("; ")}.`;

  return {
    test: "balance",
    finding,
    score: stepped ? 1 : clamp(Math.max(rms / 0.1, absTilt / 15)),
    weakerSide: absTilt >= T.tiltBorderlineDeg ? tiltSide : undefined,
    summary,
    metrics,
    quality,
  };
}

/** The person could not stand safely: a warning sign by itself. */
export function couldNotStand(): TestResult {
  return {
    test: "balance",
    finding: "abnormal",
    score: 1,
    summary: "The person could not stand safely without support.",
    metrics: {},
    quality: { validSamples: 1, totalSamples: 1, notes: ["Reported by the bystander during the balance check."] },
  };
}
