import { describe, expect, it } from "vitest";
import { GAZE_LANDMARKS as G, scoreGaze, type GazeFrame, type GazePhase } from "@/lib/scoring/gaze";
import type { Vec2 } from "@/lib/math";

/**
 * Synthetic eyes, unmirrored image: the person's left eye is on the image right (+x).
 * Each eye is 60 px wide. `look` = iris offset toward the person's left, in eye widths.
 */
function face(look: { right: number; left: number }, yawPx = 0, rollDeg = 0): Vec2[] {
  const pts: Vec2[] = Array.from({ length: 478 }, () => ({ x: 500, y: 400 }));
  pts[G.rightEyeOuter] = { x: 380, y: 300 };
  pts[G.rightEyeInner] = { x: 440, y: 300 };
  pts[G.leftEyeInner] = { x: 560, y: 300 };
  pts[G.leftEyeOuter] = { x: 620, y: 300 };
  pts[G.rightIris] = { x: 410 + look.right * 60, y: 300 };
  pts[G.leftIris] = { x: 590 + look.left * 60, y: 300 };
  pts[G.noseTip] = { x: 500 + yawPx, y: 380 };
  if (!rollDeg) return pts;
  const a = (rollDeg * Math.PI) / 180;
  return pts.map((p) => ({
    x: 500 + (p.x - 500) * Math.cos(a) - (p.y - 400) * Math.sin(a),
    y: 400 + (p.x - 500) * Math.sin(a) + (p.y - 400) * Math.cos(a),
  }));
}

interface Session {
  centre?: number;
  toLeft?: number; // how far both eyes move when looking left
  toRight?: number;
  leftEyeOnly?: boolean;
  yawWhenLooking?: number;
  rollDeg?: number;
  n?: number;
}

function session({ centre = 0, toLeft = 0.2, toRight = 0.2, yawWhenLooking = 0, rollDeg = 0, n = 15 }: Session): GazeFrame[] {
  const frames: GazeFrame[] = [];
  const add = (phase: GazePhase, g: number, yaw: number) => {
    for (let i = 0; i < n; i++) frames.push({ phase, points: face({ right: g, left: g }, yaw, rollDeg) });
  };
  add("centre", centre, 0);
  add("left", centre + toLeft, yawWhenLooking);
  add("right", centre - toRight, -yawWhenLooking);
  return frames;
}

describe("scoreGaze", () => {
  it("rates even eye movement as normal", () => {
    expect(scoreGaze(session({})).finding).toBe("normal");
  });

  it("is not fooled by head tilt (roll)", () => {
    expect(scoreGaze(session({ rollDeg: 15 })).finding).toBe("normal");
  });

  it("detects a gaze palsy and names the side", () => {
    const r = scoreGaze(session({ toLeft: 0.03, toRight: 0.22 }));
    expect(r.finding).toBe("abnormal");
    expect(r.weakerSide).toBe("left");
  });

  it("flags reduced movement to one side as borderline", () => {
    expect(scoreGaze(session({ toLeft: 0.2, toRight: 0.08 })).finding).toBe("borderline");
  });

  it("detects resting gaze deviation", () => {
    const r = scoreGaze(session({ centre: -0.25 }));
    expect(r.finding).toBe("abnormal");
    expect(r.summary).toMatch(/pulled to the right/);
  });

  it("is inconclusive when the person turns the head instead of the eyes", () => {
    expect(scoreGaze(session({ yawWhenLooking: 25 })).finding).toBe("inconclusive");
  });

  it("is inconclusive when the eyes do not move at all", () => {
    expect(scoreGaze(session({ toLeft: 0, toRight: 0 })).finding).toBe("inconclusive");
  });

  it("is inconclusive with too few frames", () => {
    expect(scoreGaze(session({ n: 3 })).finding).toBe("inconclusive");
  });
});
