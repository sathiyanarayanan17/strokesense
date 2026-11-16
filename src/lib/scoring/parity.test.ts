import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreArms, type ArmFrame } from "@/lib/scoring/arm";
import { scoreBalance, type BalanceFrame } from "@/lib/scoring/balance";
import { scoreFace, type FaceFrame } from "@/lib/scoring/face";
import { scoreGaze, type GazeFrame } from "@/lib/scoring/gaze";
import { scoreSpeech, type EnergySample, type SpeechInput } from "@/lib/scoring/speech";
import type { TestResult } from "@/lib/scoring/types";

/**
 * Cross-language parity. The fixture holds sparse landmark inputs and the TypeScript outputs.
 * This test checks the TypeScript engine still produces them; python/tests/test_parity.py checks
 * the Python port does too. Regenerate after an intentional change with: npm run parity:update
 */
const FIXTURE = join(process.cwd(), "python", "tests", "parity.fixture.json");

type Sparse = Record<string, [number, number, number?]>; // landmark index -> [x, y, visibility?]
interface Case {
  name: string;
  kind: "face" | "arm" | "balance" | "gaze" | "speech";
  input: unknown;
  expected?: Out;
}
interface Out {
  finding: string;
  weakerSide: string | null;
  score: number;
  summary: string;
  metrics: Record<string, number>;
  notes: string[];
}

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);

const toPoints = (s: Sparse) => {
  const pts: Array<{ x: number; y: number; visibility?: number }> = [];
  for (const [k, v] of Object.entries(s)) pts[Number(k)] = { x: v[0], y: v[1], ...(v[2] !== undefined ? { visibility: v[2] } : {}) };
  return pts;
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function faceSparse(smileL: number, smileR: number, yawPx: number, jitter: number): Sparse {
  const j = () => r3(rand() * jitter);
  return {
    "33": [400, 300],
    "263": [600, 300],
    "10": [500, 200],
    "152": [500, 600],
    "1": [500 + yawPx, 400],
    "61": [r3(440 - 24 * smileR + j()), r3(500 - 24 * smileR + j())],
    "291": [r3(560 + 24 * smileL + j()), r3(500 - 24 * smileL + j())],
  };
}
function faceInput(smileL: number, smileR: number, yawPx = 0, jitter = 0) {
  const f = (phase: string, l: number, r: number) => Array.from({ length: 20 }, () => ({ phase, points: faceSparse(l, r, yawPx, jitter) }));
  return [...f("neutral", 0, 0), ...f("smile", smileL, smileR)];
}

function armInput(left: [number, number], right: [number, number]) {
  const n = 300;
  return Array.from({ length: n }, (_, i) => {
    const k = i / (n - 1);
    const lh = left[0] + (left[1] - left[0]) * k;
    const rh = right[0] + (right[1] - right[0]) * k;
    return {
      t: r3((i / 30) * 1000),
      points: {
        "11": [600, 300, 0.9],
        "12": [400, 300, 0.9],
        "15": [620, r3(300 - lh * 200), 0.9],
        "16": [380, r3(300 - rh * 200), 0.9],
      } as Sparse,
    };
  });
}

function balanceInput(opts: { sway?: (t: number) => number; tilt?: number; stepAt?: number; jitter?: number }) {
  const { sway = () => 0, tilt = 0, stepAt, jitter = 0 } = opts;
  const out = [];
  for (let t = 0; t <= 10000; t += 33) {
    const dx = sway(t) * 200;
    const lean = Math.tan((tilt * Math.PI) / 180) * 200;
    const p = (x: number, y: number): [number, number, number] => [r3(x + rand() * jitter), r3(y + rand() * jitter), 0.9];
    const stepped = stepAt !== undefined && t >= stepAt;
    out.push({
      t,
      points: {
        "11": p(560 + dx + lean, 200),
        "12": p(440 + dx + lean, 200),
        "23": p(540 + dx, 400),
        "24": p(460 + dx, 400),
        "27": p(510 + (stepped ? 80 : 0), 700),
        "28": p(490, 700),
      } as Sparse,
    });
  }
  return out;
}

function gazeSparse(g: number, yawPx: number): Sparse {
  return {
    "33": [380, 300],
    "133": [440, 300],
    "362": [560, 300],
    "263": [620, 300],
    "468": [r3(410 + g * 60), 300],
    "473": [r3(590 + g * 60), 300],
    "1": [500 + yawPx, 380],
  };
}
function gazeInput(centre: number, toL: number, toR: number, yaw = 0) {
  const f = (phase: string, g: number, y: number) => Array.from({ length: 15 }, () => ({ phase, points: gazeSparse(g, y) }));
  return [...f("centre", centre, 0), ...f("left", centre + toL, yaw), ...f("right", centre - toR, -yaw)];
}

function energy(voiced: Array<[number, number]>): EnergySample[] {
  const out: EnergySample[] = [];
  for (let t = 0; t <= 4000; t += 20) out.push({ t, rms: voiced.some(([a, b]) => t >= a && t <= b) ? 0.2 : 0.005 });
  return out;
}
const speechCase = (transcript: string | null, voiced: Array<[number, number]>, extra: object = {}) => ({
  transcript,
  energy: energy(voiced),
  noiseFloor: 0.005,
  ...extra,
});

function buildCases(): Case[] {
  seed = 42;
  return [
    { name: "face even smile with jitter", kind: "face", input: faceInput(1, 1, 0, 1) },
    { name: "face left droop", kind: "face", input: faceInput(0.3, 1) },
    { name: "face mild asymmetry", kind: "face", input: faceInput(0.72, 1) },
    { name: "face turned head", kind: "face", input: faceInput(1, 1, 50) },
    { name: "arm level", kind: "arm", input: armInput([0, -0.02], [0, -0.01]) },
    { name: "arm left sinks", kind: "arm", input: armInput([0, -0.5], [0, -0.02]) },
    { name: "arm right cannot raise", kind: "arm", input: armInput([0, 0], [-1, -1]) },
    { name: "arm both tire", kind: "arm", input: armInput([0, -0.4], [0, -0.4]) },
    { name: "balance steady with jitter", kind: "balance", input: balanceInput({ sway: (t) => 0.01 * Math.sin(t / 900), jitter: 2 }) },
    { name: "balance large sway", kind: "balance", input: balanceInput({ sway: (t) => 0.12 * Math.sin(t / 500) }) },
    { name: "balance lean left", kind: "balance", input: balanceInput({ tilt: 14 }) },
    { name: "balance step", kind: "balance", input: balanceInput({ stepAt: 5000 }) },
    { name: "gaze even", kind: "gaze", input: gazeInput(0, 0.2, 0.2) },
    { name: "gaze palsy left", kind: "gaze", input: gazeInput(0, 0.03, 0.22) },
    { name: "gaze deviation", kind: "gaze", input: gazeInput(-0.25, 0.2, 0.2) },
    { name: "gaze head turn", kind: "gaze", input: gazeInput(0, 0.2, 0.2, 25) },
    { name: "speech clear", kind: "speech", input: speechCase("you can't teach an old dog new tricks", [[500, 2500]]) },
    { name: "speech garbled", kind: "speech", input: speechCase("you teach old sticks", [[500, 2500]]) },
    { name: "speech choppy", kind: "speech", input: speechCase("You can't teach an old dog new tricks", [[200, 500], [1100, 1300], [1900, 2100], [2700, 3000]]) },
    { name: "speech model high", kind: "speech", input: speechCase("You can't teach an old dog new tricks", [[500, 2500]], { modelProbability: 0.92 }) },
    { name: "speech bystander yes", kind: "speech", input: speechCase("You can't teach an old dog new tricks", [[500, 2500]], { bystander: "yes" }) },
    { name: "speech silent", kind: "speech", input: speechCase("", []) },
  ];
}

function run(c: Case): Out {
  const raw = c.input as Array<{ phase: never; t: number; points: Sparse }>;
  let r: TestResult;
  switch (c.kind) {
    case "face":
      r = scoreFace(raw.map((f): FaceFrame => ({ phase: f.phase, points: toPoints(f.points) })));
      break;
    case "arm":
      r = scoreArms(raw.map((f): ArmFrame => ({ t: f.t, points: toPoints(f.points) })));
      break;
    case "balance":
      r = scoreBalance(raw.map((f): BalanceFrame => ({ t: f.t, points: toPoints(f.points) })));
      break;
    case "gaze":
      r = scoreGaze(raw.map((f): GazeFrame => ({ phase: f.phase, points: toPoints(f.points) })));
      break;
    default:
      r = scoreSpeech(c.input as SpeechInput);
  }
  return {
    finding: r.finding,
    weakerSide: r.weakerSide ?? null,
    score: r.score,
    summary: r.summary,
    metrics: r.metrics,
    notes: r.quality.notes,
  };
}

describe("cross-language parity fixture", () => {
  it("matches the committed TypeScript outputs", () => {
    const cases = buildCases();
    if (process.env.UPDATE_PARITY) {
      writeFileSync(FIXTURE, JSON.stringify(cases.map((c) => ({ ...c, expected: run(c) }))) + "\n");
      return;
    }
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Case[];
    expect(fixture.map((c) => c.name)).toEqual(cases.map((c) => c.name));
    for (const c of fixture) {
      const got = run(c);
      expect(got.finding, c.name).toBe(c.expected!.finding);
      expect(got.weakerSide, c.name).toBe(c.expected!.weakerSide);
      expect(got.summary, c.name).toBe(c.expected!.summary);
      expect(got.notes, c.name).toEqual(c.expected!.notes);
      expect(got.score, c.name).toBeCloseTo(c.expected!.score, 9);
      expect(Object.keys(got.metrics).sort(), c.name).toEqual(Object.keys(c.expected!.metrics).sort());
      for (const [k, v] of Object.entries(c.expected!.metrics)) expect(got.metrics[k], `${c.name}.${k}`).toBeCloseTo(v, 9);
    }
  });
});
