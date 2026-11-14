import { clamp, dist, dot, median, normalize, percentile, round, sub, type Vec2 } from "../math";
import type { Side, TestResult } from "./types";

/**
 * Facial droop analysis (the "F" in BE-FAST).
 *
 * Method
 * 1. For every frame, build a face-aligned coordinate system:
 *    origin = midpoint of the outer eye corners, x-axis = right eye -> left eye,
 *    y-axis = forehead -> chin (orthogonalised), unit = inter-ocular distance.
 *    This removes head roll, distance from camera and face size.
 * 2. Reject frames where the head is turned (yaw), because perspective makes one
 *    side of the mouth look shorter and would fake an asymmetry.
 * 3. Capture a resting ("neutral") baseline, then a maximal smile.
 * 4. Excursion = how far each mouth corner travels from rest to smile.
 *    Central facial palsy weakens the lower face on one side, so that corner
 *    moves less. Excursion Asymmetry Index (EAI) = |L - R| / max(L, R).
 * 5. Supporting signal: vertical droop of one corner during the smile.
 *
 * Landmark indices follow the MediaPipe Face Mesh topology. "Left"/"right" are
 * always the PERSON's own sides (index 33 is the person's right eye).
 */

export const FACE_LANDMARKS = {
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  mouthRight: 61,
  mouthLeft: 291,
  noseTip: 1,
  forehead: 10,
  chin: 152,
} as const;

/** Provisional thresholds. Calibrate against a labelled dataset before any clinical use. */
export const FACE_THRESHOLDS = {
  maxYaw: 0.12, // nose-tip lateral offset, in inter-ocular units
  minFramesPerPhase: 8,
  minExcursion: 0.05, // smallest smile movement we accept as "a smile happened"
  eaiBorderline: 0.2,
  eaiAbnormal: 0.35,
  droopBorderline: 0.06, // corner height difference, inter-ocular units
  droopAbnormal: 0.1,
};

export type FacePhase = "neutral" | "smile";

export interface FaceFrame {
  phase: FacePhase;
  /** Landmarks in PIXEL coordinates (normalised x * width, y * height). */
  points: Vec2[];
}

interface LocalCorners {
  right: Vec2;
  left: Vec2;
  yaw: number;
}

/** Convert one frame to face-aligned coordinates. Returns null for unusable frames. */
export function toLocalCorners(points: Vec2[]): LocalCorners | null {
  const L = FACE_LANDMARKS;
  const needed = [L.rightEyeOuter, L.leftEyeOuter, L.mouthRight, L.mouthLeft, L.noseTip, L.forehead, L.chin];
  if (needed.some((i) => !points[i])) return null;

  const rEye = points[L.rightEyeOuter];
  const lEye = points[L.leftEyeOuter];
  const scale = dist(rEye, lEye);
  if (scale < 1e-6) return null;

  const origin = { x: (rEye.x + lEye.x) / 2, y: (rEye.y + lEye.y) / 2 };
  const xAxis = normalize(sub(lEye, rEye));
  // Forehead -> chin, with the x component removed (Gram-Schmidt).
  const vertical = sub(points[L.chin], points[L.forehead]);
  const yRaw = { x: vertical.x - dot(vertical, xAxis) * xAxis.x, y: vertical.y - dot(vertical, xAxis) * xAxis.y };
  const yAxis = normalize(yRaw);
  if (yAxis.x === 0 && yAxis.y === 0) return null;

  const local = (p: Vec2): Vec2 => {
    const d = sub(p, origin);
    return { x: dot(d, xAxis) / scale, y: dot(d, yAxis) / scale };
  };

  return {
    right: local(points[L.mouthRight]),
    left: local(points[L.mouthLeft]),
    yaw: local(points[L.noseTip]).x,
  };
}

export function scoreFace(frames: FaceFrame[]): TestResult {
  const T = FACE_THRESHOLDS;
  const notes: string[] = [];
  const neutral: LocalCorners[] = [];
  const smile: LocalCorners[] = [];
  let turned = 0;

  for (const f of frames) {
    const c = toLocalCorners(f.points);
    if (!c) continue;
    if (Math.abs(c.yaw) > T.maxYaw) {
      turned++;
      continue;
    }
    (f.phase === "neutral" ? neutral : smile).push(c);
  }

  const quality = {
    validSamples: neutral.length + smile.length,
    totalSamples: frames.length,
    notes,
  };
  if (turned > frames.length * 0.3) notes.push("Head was often turned away from the camera.");

  if (neutral.length < T.minFramesPerPhase || smile.length < T.minFramesPerPhase) {
    notes.push("Not enough clear, front-facing frames of the face.");
    return {
      test: "face",
      finding: "inconclusive",
      score: 0,
      summary: "We could not see the face clearly enough. Retry facing the camera in good light.",
      metrics: { neutralFrames: neutral.length, smileFrames: smile.length },
      quality,
    };
  }

  // Resting position of each corner (median is robust to blinks / jitter).
  const restR = { x: median(neutral.map((c) => c.right.x)), y: median(neutral.map((c) => c.right.y)) };
  const restL = { x: median(neutral.map((c) => c.left.x)), y: median(neutral.map((c) => c.left.y)) };

  // Peak excursion: 90th percentile instead of max, to ignore single-frame glitches.
  const excR = percentile(smile.map((c) => dist(c.right, restR)), 90);
  const excL = percentile(smile.map((c) => dist(c.left, restL)), 90);
  const maxExc = Math.max(excR, excL);

  // Vertical droop during the smile: positive => person's left corner sits lower.
  const droop = median(smile.map((c) => c.left.y - c.right.y)) - median(neutral.map((c) => c.left.y - c.right.y));

  const metrics = {
    excursionLeft: round(excL),
    excursionRight: round(excR),
    excursionAsymmetry: 0,
    smileDroop: round(droop),
    neutralFrames: neutral.length,
    smileFrames: smile.length,
  };

  if (maxExc < T.minExcursion) {
    notes.push("No smile movement detected.");
    return {
      test: "face",
      finding: "inconclusive",
      score: 0,
      summary: "We did not detect a smile. Ask the person to smile widely and show their teeth, then retry.",
      metrics,
      quality,
    };
  }

  const eai = Math.abs(excL - excR) / maxExc;
  metrics.excursionAsymmetry = round(eai);
  const absDroop = Math.abs(droop);

  // Weaker side = the side that moves less (fallback: the side that sags lower).
  const weakerSide: Side = Math.abs(excL - excR) > 1e-3 ? (excL < excR ? "left" : "right") : droop > 0 ? "left" : "right";

  let finding: TestResult["finding"] = "normal";
  if (eai >= T.eaiAbnormal || absDroop >= T.droopAbnormal) finding = "abnormal";
  else if (eai >= T.eaiBorderline || absDroop >= T.droopBorderline) finding = "borderline";

  const pct = Math.round(eai * 100);
  const summary =
    finding === "normal"
      ? `Both sides of the mouth moved evenly (difference ${pct}%).`
      : `The ${weakerSide} side of the mouth moved ${pct}% less than the other side${
          absDroop >= T.droopBorderline ? " and sat lower during the smile" : ""
        }.`;

  return {
    test: "face",
    finding,
    score: clamp(Math.max(eai / 0.6, absDroop / 0.2)),
    weakerSide: finding === "normal" ? undefined : weakerSide,
    summary,
    metrics,
    quality,
  };
}
