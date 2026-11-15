import { describe, expect, it } from "vitest";
import { BALANCE_LANDMARKS as B, couldNotStand, scoreBalance, type BalanceFrame, type BalancePoint } from "@/lib/scoring/balance";

/**
 * Synthetic standing person, unmirrored image (person's left = +x).
 * Torso length 200 px. `sway(t)` = lateral offset in torso lengths.
 */
function stand(opts: {
  sway?: (t: number) => number;
  tiltDeg?: number;
  stepAtMs?: number;
  visibility?: number;
  ms?: number;
  jitter?: number;
}): BalanceFrame[] {
  const { sway = () => 0, tiltDeg = 0, stepAtMs, visibility = 0.9, ms = 10_000, jitter = 0 } = opts;
  const frames: BalanceFrame[] = [];
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * jitter;
  for (let t = 0; t <= ms; t += 33) {
    const dx = sway(t) * 200;
    const lean = Math.tan((tiltDeg * Math.PI) / 180) * 200; // shoulders shifted relative to hips
    const pts: BalancePoint[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility }));
    const p = (x: number, y: number) => ({ x: x + rand(), y: y + rand(), visibility });
    pts[B.leftShoulder] = p(560 + dx + lean, 200);
    pts[B.rightShoulder] = p(440 + dx + lean, 200);
    pts[B.leftHip] = p(540 + dx, 400);
    pts[B.rightHip] = p(460 + dx, 400);
    const stepped = stepAtMs !== undefined && t >= stepAtMs;
    pts[B.leftAnkle] = p(510 + (stepped ? 80 : 0), 700);
    pts[B.rightAnkle] = p(490, 700);
    frames.push({ t, points: pts });
  }
  return frames;
}

describe("scoreBalance", () => {
  it("rates steady standing as normal, even with landmark jitter", () => {
    const r = scoreBalance(stand({ sway: (t) => 0.01 * Math.sin(t / 900), jitter: 2 }));
    expect(r.finding).toBe("normal");
  });

  it("flags large sway as abnormal", () => {
    expect(scoreBalance(stand({ sway: (t) => 0.12 * Math.sin(t / 500) })).finding).toBe("abnormal");
  });

  it("flags moderate sway as borderline", () => {
    expect(scoreBalance(stand({ sway: (t) => 0.06 * Math.sin(t / 1500) })).finding).toBe("borderline");
  });

  it("detects a lean and names the side", () => {
    const r = scoreBalance(stand({ tiltDeg: 14 }));
    expect(r.finding).toBe("abnormal");
    expect(r.weakerSide).toBe("left");
    expect(scoreBalance(stand({ tiltDeg: -14 })).weakerSide).toBe("right");
  });

  it("treats a step to catch balance as abnormal", () => {
    const r = scoreBalance(stand({ stepAtMs: 5000 }));
    expect(r.finding).toBe("abnormal");
    expect(r.summary).toMatch(/step/);
  });

  it("is inconclusive when the feet are not visible", () => {
    expect(scoreBalance(stand({ visibility: 0.2 })).finding).toBe("inconclusive");
  });

  it("is inconclusive when too short", () => {
    expect(scoreBalance(stand({ ms: 3000 })).finding).toBe("inconclusive");
  });

  it("not being able to stand is a warning sign", () => {
    expect(couldNotStand().finding).toBe("abnormal");
  });
});
