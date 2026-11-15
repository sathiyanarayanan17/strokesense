import { clamp, dot, median, normalize, round, sub, type Vec2 } from "../math";
import type { Side, TestResult } from "./types";

/**
 * Eye movements (the "E" in BE-FAST), measured with iris tracking.
 *
 * The person keeps their head still and follows a dot: centre -> their left ->
 * centre -> their right. Stroke can cause gaze deviation (eyes pulled to one
 * side at rest) or a gaze palsy (both eyes cannot look toward one side).
 *
 * For each eye the iris centre is expressed relative to the middle of that eye,
 * along the face's own left-right axis, in units of the eye's width.
 * Positive = toward the person's LEFT. Landmark indices follow MediaPipe Face
 * Mesh with iris refinement (478 points).
 */

export const GAZE_LANDMARKS = {
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  rightIris: 468,
  leftIris: 473,
  noseTip: 1,
} as const;

/** Provisional thresholds — iris tracking from a phone is noisy; calibrate on real data. */
export const GAZE_THRESHOLDS = {
  maxHeadYaw: 0.12, // nose offset from eye midpoint, inter-ocular units
  maxHeadMove: 0.08, // head yaw change between phases: they turned the head instead of the eyes
  minFramesPerPhase: 8,
  minExcursion: 0.06, // smallest eye movement we accept as "followed the dot"
  palsyBorderline: 0.5, // weaker side moves < 50% of the stronger side
  palsyAbnormal: 0.3,
  deviationBorderline: 0.12,
  deviationAbnormal: 0.2,
};

export type GazePhase = "centre" | "left" | "right";

export interface GazeFrame {
  phase: GazePhase;
  /** Face landmarks in PIXEL coordinates, including iris points. */
  points: Vec2[];
}

interface EyeSample {
  right: number;
  left: number;
  yaw: number;
}

export function eyeOffsets(points: Vec2[]): EyeSample | null {
  const L = GAZE_LANDMARKS;
  if (Object.values(L).some((i) => !points[i])) return null;
  const xAxis = normalize(sub(points[L.leftEyeOuter], points[L.rightEyeOuter]));
  if (xAxis.x === 0 && xAxis.y === 0) return null;
  const along = (p: Vec2) => dot(p, xAxis);
  const eye = (inner: number, outer: number, iris: number) => {
    const a = along(points[inner]);
    const b = along(points[outer]);
    const width = Math.abs(b - a);
    return width < 1e-6 ? null : (along(points[iris]) - (a + b) / 2) / width;
  };
  const right = eye(L.rightEyeInner, L.rightEyeOuter, L.rightIris);
  const left = eye(L.leftEyeInner, L.leftEyeOuter, L.leftIris);
  if (right === null || left === null) return null;
  const iod = Math.abs(along(points[L.leftEyeOuter]) - along(points[L.rightEyeOuter]));
  const midEyes = (along(points[L.leftEyeOuter]) + along(points[L.rightEyeOuter])) / 2;
  return { right, left, yaw: (along(points[L.noseTip]) - midEyes) / iod };
}

export function scoreGaze(frames: GazeFrame[]): TestResult {
  const T = GAZE_THRESHOLDS;
  const notes: string[] = [];
  const by: Record<GazePhase, EyeSample[]> = { centre: [], left: [], right: [] };
  for (const f of frames) {
    const s = eyeOffsets(f.points);
    if (s && Math.abs(s.yaw) <= T.maxHeadYaw) by[f.phase].push(s);
  }
  const quality = { validSamples: by.centre.length + by.left.length + by.right.length, totalSamples: frames.length, notes };

  if ((["centre", "left", "right"] as const).some((p) => by[p].length < T.minFramesPerPhase)) {
    notes.push("The eyes were not clearly visible in every part of the test.");
    return {
      test: "eyes",
      finding: "inconclusive",
      score: 0,
      summary: "We could not track the eyes. Hold the phone closer, in good light, and keep the head facing the screen.",
      metrics: { centreFrames: by.centre.length, leftFrames: by.left.length, rightFrames: by.right.length },
      quality,
    };
  }

  const med = (p: GazePhase, k: "right" | "left" | "yaw") => median(by[p].map((s) => s[k]));
  const both = (p: GazePhase) => (med(p, "right") + med(p, "left")) / 2;
  const centre = both("centre");
  const toLeft = both("left") - centre;
  const toRight = centre - both("right");
  const headMove = Math.max(Math.abs(med("left", "yaw") - med("centre", "yaw")), Math.abs(med("right", "yaw") - med("centre", "yaw")));

  const metrics: Record<string, number> = {
    restingGaze: round(centre),
    excursionLeft: round(toLeft),
    excursionRight: round(toRight),
    headMovement: round(headMove),
  };

  if (headMove > T.maxHeadMove) {
    notes.push("The head turned to follow the dot instead of only the eyes.");
    return {
      test: "eyes",
      finding: "inconclusive",
      score: 0,
      summary: "The head moved during the test. Hold the head still (a bystander can gently steady it) and follow the dot with the eyes only.",
      metrics,
      quality,
    };
  }
  if (Math.max(toLeft, toRight) < T.minExcursion) {
    notes.push("Little or no eye movement was detected in either direction.");
    return {
      test: "eyes",
      finding: "inconclusive",
      score: 0,
      summary: "We did not see the eyes follow the dot. Retry closer to the camera.",
      metrics,
      quality,
    };
  }

  const weaker: Side = toLeft < toRight ? "left" : "right";
  const ratio = Math.max(0, Math.min(toLeft, toRight)) / Math.max(toLeft, toRight);
  const absDev = Math.abs(centre);
  const devSide: Side = centre > 0 ? "left" : "right";
  const reasons: string[] = [];
  let finding: TestResult["finding"] = "normal";
  const raise = (f: "borderline" | "abnormal", why: string) => {
    if (f === "abnormal" || finding === "normal") finding = f;
    reasons.push(why);
  };
  if (ratio < T.palsyAbnormal) raise("abnormal", `the eyes could not look properly to the ${weaker}`);
  else if (ratio < T.palsyBorderline) raise("borderline", `the eyes moved less to the ${weaker}`);
  if (absDev >= T.deviationAbnormal) raise("abnormal", `at rest the eyes were pulled to the ${devSide}`);
  else if (absDev >= T.deviationBorderline) raise("borderline", `at rest the eyes pointed slightly to the ${devSide}`);
  metrics.excursionRatio = round(ratio);

  return {
    test: "eyes",
    finding,
    score: clamp(Math.max(1 - ratio, absDev / 0.3)),
    weakerSide: finding === "normal" ? undefined : ratio < T.palsyBorderline ? weaker : devSide,
    summary: finding === "normal" ? "Both eyes followed the dot evenly to each side." : `Possible eye-movement problem: ${reasons.join("; ")}.`,
    metrics,
    quality,
  };
}
