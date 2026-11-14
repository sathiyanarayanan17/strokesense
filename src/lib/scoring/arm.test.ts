import { describe, expect, it } from "vitest";
import { POSE_LANDMARKS as P, scoreArms, type ArmFrame, type PosePoint } from "@/lib/scoring/arm";

/**
 * Shoulders 200px apart at y=300. Heights are in shoulder-width units
 * (0 = wrist level with shoulder, negative = below).
 */
function pose(leftHeight: number, rightHeight: number, visibility = 0.9): PosePoint[] {
  const pts: PosePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility }));
  pts[P.leftShoulder] = { x: 600, y: 300, visibility };
  pts[P.rightShoulder] = { x: 400, y: 300, visibility };
  pts[P.leftWrist] = { x: 620, y: 300 - leftHeight * 200, visibility };
  pts[P.rightWrist] = { x: 380, y: 300 - rightHeight * 200, visibility };
  return pts;
}

/** 10 s at 30 fps; each side's height can change linearly over time. */
function hold(left: [number, number], right: [number, number], visibility = 0.9): ArmFrame[] {
  const n = 300;
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    return {
      t: (i / 30) * 1000,
      points: pose(left[0] + (left[1] - left[0]) * k, right[0] + (right[1] - right[0]) * k, visibility),
    };
  });
}

describe("scoreArms", () => {
  it("rates level arms as normal", () => {
    expect(scoreArms(hold([0, -0.02], [0, -0.01])).finding).toBe("normal");
  });

  it("detects one arm drifting down", () => {
    const r = scoreArms(hold([0, -0.5], [0, -0.02]));
    expect(r.finding).toBe("abnormal");
    expect(r.weakerSide).toBe("left");
    expect(r.metrics.slopeLeftPerSec).toBeLessThan(0);
  });

  it("flags mild one-sided drift as borderline", () => {
    expect(scoreArms(hold([0, 0], [0, -0.17])).finding).toBe("borderline");
  });

  it("treats an arm that cannot be raised as abnormal", () => {
    const r = scoreArms(hold([0, 0], [-1, -1]));
    expect(r.finding).toBe("abnormal");
    expect(r.weakerSide).toBe("right");
  });

  it("does not call both arms lowering together a one-sided weakness", () => {
    const r = scoreArms(hold([0, -0.4], [0, -0.4]));
    expect(r.finding).toBe("normal");
    expect(r.quality.notes.join(" ")).toMatch(/tiredness/);
  });

  it("is inconclusive when landmarks are not visible", () => {
    expect(scoreArms(hold([0, 0], [0, 0], 0.2)).finding).toBe("inconclusive");
  });

  it("is inconclusive when the hold is too short", () => {
    expect(scoreArms(hold([0, 0], [0, 0]).slice(0, 60)).finding).toBe("inconclusive");
  });
});
