/**
 * Synthetic robustness evaluation.
 *
 * Generates simulated exams with KNOWN ground truth, perturbs them with the
 * kinds of noise a phone camera produces, and measures how often the scoring
 * engine gets the answer right. This tests the measurement pipeline, not
 * clinical accuracy: real patients must be studied before any medical claim.
 */
import { FACE_LANDMARKS as FL, type FaceFrame } from "../lib/scoring/face";
import { POSE_LANDMARKS as PL, type ArmFrame, type PosePoint } from "../lib/scoring/arm";
import type { Vec2 } from "../lib/math";

/** Seeded PRNG (mulberry32) so every run produces identical numbers. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * next();
  const gauss = (sigma: number) => {
    const u = Math.max(next(), 1e-12);
    return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, uniform, gauss };
}
export type Rng = ReturnType<typeof rng>;

// ---------- Face ----------

export interface FaceCase {
  /** Weakness of the affected side: 0 = normal, 1 = no movement. */
  weakness: number;
  weakSide: "left" | "right";
  jitterPx: number; // per-frame landmark noise (σ) at an inter-ocular distance of 200 px
  rollDeg: number;
  scale: number; // camera distance: 0.5 = far, 1.5 = close
  yawPx: number; // small head turn (nose offset)
  smileStrength: number; // how hard the person smiles
}

export function simulateFace(c: FaceCase, r: Rng, framesPerPhase = 20): FaceFrame[] {
  // Natural resting asymmetry of the person, fixed for the session.
  const restOffset = { rx: r.gauss(2), ry: r.gauss(2), lx: r.gauss(2), ly: r.gauss(2) };
  const frame = (phase: "neutral" | "smile", progress: number): FaceFrame => {
    const pts: Vec2[] = Array.from({ length: 478 }, () => ({ x: 500, y: 400 }));
    const j = () => r.gauss(c.jitterPx);
    const sR = c.weakSide === "right" ? 1 - c.weakness : 1;
    const sL = c.weakSide === "left" ? 1 - c.weakness : 1;
    const k = phase === "smile" ? c.smileStrength * progress : 0;
    pts[FL.rightEyeOuter] = { x: 400 + j(), y: 300 + j() };
    pts[FL.leftEyeOuter] = { x: 600 + j(), y: 300 + j() };
    pts[FL.forehead] = { x: 500 + j(), y: 200 + j() };
    pts[FL.chin] = { x: 500 + j(), y: 600 + j() };
    pts[FL.noseTip] = { x: 500 + c.yawPx + j(), y: 400 + j() };
    pts[FL.mouthRight] = { x: 440 + restOffset.rx - 24 * sR * k + j(), y: 500 + restOffset.ry - 24 * sR * k + j() };
    pts[FL.mouthLeft] = { x: 560 + restOffset.lx + 24 * sL * k + j(), y: 500 + restOffset.ly - 24 * sL * k + j() };

    const a = (c.rollDeg * Math.PI) / 180;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    return {
      phase,
      points: pts.map((p) => {
        const dx = (p.x - 500) * c.scale;
        const dy = (p.y - 400) * c.scale;
        return { x: 640 + dx * cos - dy * sin, y: 360 + dx * sin + dy * cos };
      }),
    };
  };
  return [
    ...Array.from({ length: framesPerPhase }, () => frame("neutral", 0)),
    // Smile ramps up over the first few frames, like a real person.
    ...Array.from({ length: framesPerPhase }, (_, i) => frame("smile", Math.min(1, (i + 1) / 5))),
  ];
}

// ---------- Arms ----------

export interface ArmCase {
  /** Downward drift of the weak arm over the hold, in shoulder widths. 0 = no weakness. */
  drift: number;
  weakSide: "left" | "right";
  /** Both arms sink together by this much (fatigue, not one-sided weakness). */
  fatigue: number;
  noise: number; // wrist-height noise σ, shoulder widths
  fps: number;
  dropout: number; // fraction of frames with low landmark visibility
}

export function simulateArms(c: ArmCase, r: Rng, holdMs = 10_000): ArmFrame[] {
  const n = Math.round((holdMs / 1000) * c.fps);
  const sw = 200; // shoulder width in px
  const baseL = r.gauss(0.04);
  const baseR = r.gauss(0.04);
  const out: ArmFrame[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const tremor = 0.015 * Math.sin(i * 1.7);
    const hL = baseL - c.fatigue * k - (c.weakSide === "left" ? c.drift * k : 0) + r.gauss(c.noise) + tremor;
    const hR = baseR - c.fatigue * k - (c.weakSide === "right" ? c.drift * k : 0) + r.gauss(c.noise) - tremor;
    const vis = r.next() < c.dropout ? 0.2 : 0.95;
    const pts: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: vis }));
    pts[PL.leftShoulder] = { x: 640 + sw / 2, y: 300 + r.gauss(1), visibility: vis };
    pts[PL.rightShoulder] = { x: 640 - sw / 2, y: 300 + r.gauss(1), visibility: vis };
    pts[PL.leftWrist] = { x: 640 + sw / 2 + 10, y: 300 - hL * sw, visibility: vis };
    pts[PL.rightWrist] = { x: 640 - sw / 2 - 10, y: 300 - hR * sw, visibility: vis };
    out.push({ t: (i / c.fps) * 1000, points: pts });
  }
  return out;
}

// ---------- Statistics ----------

/** Wilson score interval for a binomial proportion (95%). */
export function wilson(successes: number, n: number): [number, number] {
  if (n === 0) return [NaN, NaN];
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
