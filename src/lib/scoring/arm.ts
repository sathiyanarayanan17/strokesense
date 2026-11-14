import { clamp, dist, median, round, slope, type Vec2 } from "../math";
import type { Side, TestResult } from "./types";

/**
 * Arm drift analysis (the "A" in BE-FAST), a camera version of the clinical
 * pronator-drift test: both arms held out at shoulder height for ~10 seconds
 * with eyes closed. A weak arm slowly sinks, or cannot be raised at all.
 *
 * Per frame and per side we compute the wrist height relative to the shoulder
 * line, in shoulder-width units (positive = above shoulder). That makes the
 * measure independent of camera distance and body size.
 *
 * Landmark indices follow the MediaPipe Pose topology (person's own sides).
 */

export const POSE_LANDMARKS = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
} as const;

/** Provisional thresholds. Calibrate before clinical use. */
export const ARM_THRESHOLDS = {
  minVisibility: 0.5,
  minFrames: 20,
  minDurationMs: 5000,
  windowMs: 1500, // start / end windows used to measure drift
  raiseFailHeight: -0.6, // wrist this far below shoulder at start = could not raise
  driftBorderline: 0.12,
  driftAbnormal: 0.22,
};

export interface PosePoint extends Vec2 {
  visibility?: number;
}

export interface ArmFrame {
  /** Milliseconds since the hold phase started. */
  t: number;
  /** Pose landmarks in PIXEL coordinates. */
  points: PosePoint[];
}

interface ArmSample {
  t: number;
  left: number;
  right: number;
}

export function armHeights(points: PosePoint[], minVisibility = ARM_THRESHOLDS.minVisibility) {
  const P = POSE_LANDMARKS;
  const ls = points[P.leftShoulder];
  const rs = points[P.rightShoulder];
  const lw = points[P.leftWrist];
  const rw = points[P.rightWrist];
  if (!ls || !rs || !lw || !rw) return null;
  if ([ls, rs, lw, rw].some((p) => (p.visibility ?? 1) < minVisibility)) return null;
  const width = dist(ls, rs);
  if (width < 1e-6) return null;
  // Image y grows downward, so shoulder.y - wrist.y is positive when the wrist is higher.
  return { left: (ls.y - lw.y) / width, right: (rs.y - rw.y) / width };
}

export function scoreArms(frames: ArmFrame[]): TestResult {
  const T = ARM_THRESHOLDS;
  const notes: string[] = [];
  const samples: ArmSample[] = [];

  for (const f of frames) {
    const h = armHeights(f.points);
    if (h) samples.push({ t: f.t, ...h });
  }

  const quality = { validSamples: samples.length, totalSamples: frames.length, notes };
  const duration = samples.length ? samples[samples.length - 1].t - samples[0].t : 0;

  if (samples.length < T.minFrames || duration < T.minDurationMs) {
    notes.push("Shoulders and wrists were not clearly visible for long enough.");
    return {
      test: "arm",
      finding: "inconclusive",
      score: 0,
      summary: "We could not track both arms. Step back so the head, shoulders and hands are all in view, then retry.",
      metrics: { validFrames: samples.length, durationMs: Math.round(duration) },
      quality,
    };
  }

  const t0 = samples[0].t;
  const tEnd = samples[samples.length - 1].t;
  const start = samples.filter((s) => s.t - t0 <= T.windowMs);
  const end = samples.filter((s) => tEnd - s.t <= T.windowMs);

  const startL = median(start.map((s) => s.left));
  const startR = median(start.map((s) => s.right));
  const endL = median(end.map((s) => s.left));
  const endR = median(end.map((s) => s.right));

  const driftL = startL - endL; // positive = arm sank
  const driftR = startR - endR;
  const ts = samples.map((s) => (s.t - t0) / 1000);
  const slopeL = slope(ts, samples.map((s) => s.left));
  const slopeR = slope(ts, samples.map((s) => s.right));

  const failL = startL < T.raiseFailHeight;
  const failR = startR < T.raiseFailHeight;
  const driftDiff = Math.abs(driftL - driftR);

  const metrics = {
    startHeightLeft: round(startL),
    startHeightRight: round(startR),
    driftLeft: round(driftL),
    driftRight: round(driftR),
    slopeLeftPerSec: round(slopeL),
    slopeRightPerSec: round(slopeR),
    durationMs: Math.round(duration),
  };

  let finding: TestResult["finding"];
  let weakerSide: Side | undefined;
  let summary: string;

  if (failL !== failR) {
    // One arm up, the other could not be raised: strongest possible sign.
    weakerSide = failL ? "left" : "right";
    finding = "abnormal";
    summary = `The ${weakerSide} arm could not be raised to shoulder height.`;
  } else if (failL && failR) {
    finding = "inconclusive";
    notes.push("Neither arm reached shoulder height.");
    summary = "Neither arm was raised to shoulder height. Retry, or answer the bystander question.";
  } else {
    weakerSide = driftL > driftR ? "left" : "right";
    const worst = Math.max(driftL, driftR);
    if (driftDiff >= T.driftAbnormal && worst >= T.driftAbnormal) finding = "abnormal";
    else if (driftDiff >= T.driftBorderline && worst >= T.driftBorderline) finding = "borderline";
    else finding = "normal";

    if (finding === "normal" && driftL >= T.driftAbnormal && driftR >= T.driftAbnormal) {
      notes.push("Both arms lowered together, which is more typical of tiredness than one-sided weakness.");
    }

    summary =
      finding === "normal"
        ? "Both arms stayed level."
        : `The ${weakerSide} arm drifted down while the other stayed up.`;
  }

  return {
    test: "arm",
    finding,
    score: finding === "abnormal" && (failL || failR) ? 1 : clamp(driftDiff / 0.4),
    weakerSide: finding === "normal" || finding === "inconclusive" ? undefined : weakerSide,
    summary,
    metrics,
    quality,
  };
}
