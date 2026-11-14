import { describe, expect, it } from "vitest";
import { FACE_LANDMARKS as L, scoreFace, type FaceFrame } from "@/lib/scoring/face";
import type { Vec2 } from "@/lib/math";

interface FaceOpts {
  smileRight?: number; // 0..1 fraction of a full smile on the person's right side
  smileLeft?: number;
  yawPx?: number; // nose offset to simulate a turned head
  rollDeg?: number; // in-plane head tilt
  jitter?: number;
}

/** Synthetic face in pixel coordinates (unmirrored camera image: person's right = image left). */
function makeFace({ smileRight = 0, smileLeft = 0, yawPx = 0, rollDeg = 0, jitter = 0 }: FaceOpts): Vec2[] {
  const pts: Vec2[] = Array.from({ length: 478 }, () => ({ x: 500, y: 400 }));
  const j = () => (Math.random() - 0.5) * jitter;
  pts[L.rightEyeOuter] = { x: 400, y: 300 };
  pts[L.leftEyeOuter] = { x: 600, y: 300 };
  pts[L.forehead] = { x: 500, y: 200 };
  pts[L.chin] = { x: 500, y: 600 };
  pts[L.noseTip] = { x: 500 + yawPx, y: 400 };
  // A full smile pulls each corner 24px outward and 24px up.
  pts[L.mouthRight] = { x: 440 - 24 * smileRight + j(), y: 500 - 24 * smileRight + j() };
  pts[L.mouthLeft] = { x: 560 + 24 * smileLeft + j(), y: 500 - 24 * smileLeft + j() };

  if (rollDeg) {
    const a = (rollDeg * Math.PI) / 180;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return pts.map((p) => {
      const dx = p.x - 500;
      const dy = p.y - 400;
      return { x: 500 + dx * c - dy * s, y: 400 + dx * s + dy * c };
    });
  }
  return pts;
}

function session(smile: FaceOpts, extra: FaceOpts = {}, n = 20): FaceFrame[] {
  return [
    ...Array.from({ length: n }, () => ({ phase: "neutral" as const, points: makeFace({ ...extra }) })),
    ...Array.from({ length: n }, () => ({ phase: "smile" as const, points: makeFace({ ...extra, ...smile }) })),
  ];
}

describe("scoreFace", () => {
  it("rates an even smile as normal", () => {
    const r = scoreFace(session({ smileLeft: 1, smileRight: 1 }, { jitter: 1 }));
    expect(r.finding).toBe("normal");
    expect(r.metrics.excursionAsymmetry).toBeLessThan(0.15);
  });

  it("detects a one-sided droop and names the person's weaker side", () => {
    const r = scoreFace(session({ smileLeft: 0.3, smileRight: 1 }));
    expect(r.finding).toBe("abnormal");
    expect(r.weakerSide).toBe("left");

    const r2 = scoreFace(session({ smileLeft: 1, smileRight: 0.3 }));
    expect(r2.weakerSide).toBe("right");
  });

  it("flags a mild asymmetry as borderline", () => {
    const r = scoreFace(session({ smileLeft: 0.72, smileRight: 1 }));
    expect(r.finding).toBe("borderline");
  });

  it("is not fooled by head tilt (roll)", () => {
    const r = scoreFace(session({ smileLeft: 1, smileRight: 1 }, { rollDeg: 20 }));
    expect(r.finding).toBe("normal");
  });

  it("rejects frames where the head is turned instead of reporting fake asymmetry", () => {
    const r = scoreFace(session({ smileLeft: 1, smileRight: 1 }, { yawPx: 50 }));
    expect(r.finding).toBe("inconclusive");
  });

  it("is inconclusive when no smile happens", () => {
    const r = scoreFace(session({ smileLeft: 0, smileRight: 0 }));
    expect(r.finding).toBe("inconclusive");
  });

  it("is inconclusive with too few frames", () => {
    expect(scoreFace(session({ smileLeft: 1, smileRight: 1 }, {}, 3)).finding).toBe("inconclusive");
  });
});
