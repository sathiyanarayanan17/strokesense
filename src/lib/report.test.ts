import { describe, expect, it } from "vitest";
import { buildReport, decodeReport, encodeReport } from "@/lib/report";
import type { TestResult } from "@/lib/scoring/types";

const face: TestResult = {
  test: "face",
  finding: "abnormal",
  score: 0.8,
  weakerSide: "left",
  summary: "The left side of the mouth moved 52% less than the other side.",
  metrics: { excursionAsymmetry: 0.52, smileDroop: 0.11 },
  quality: { validSamples: 40, totalSamples: 42, notes: [] },
};

const encode = (obj: unknown) =>
  btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("report encoding", () => {
  it("round-trips a report", () => {
    const report = buildReport([face], "2026-11-14T03:00:00.000Z", 1_763_090_000_000);
    const decoded = decodeReport(encodeReport(report));
    expect(decoded).toEqual(report);
  });

  it("handles non-ASCII text", () => {
    const report = buildReport([{ ...face, summary: "முகம் — चेहरा" }], null, 1);
    expect(decodeReport(encodeReport(report))?.results[0].summary).toBe("முகம் — चेहरा");
  });

  it("keeps the encoded link small enough for a QR code", () => {
    const all: TestResult[] = (["balance", "eyes", "face", "arm", "speech"] as const).map((t) => ({ ...face, test: t }));
    expect(encodeReport(buildReport(all, "2026-11-14T03:00:00.000Z", 1)).length).toBeLessThan(2000);
  });

  it("rejects garbage and tampered data", () => {
    expect(decodeReport("not-base64!!")).toBeNull();
    expect(decodeReport(encode({ v: 99, k: null, a: 1, r: [] }))).toBeNull();
    expect(decodeReport(encode({ v: 1, k: null, a: 1, r: [{ t: "hack", f: "normal", s: "", m: {} }] }))).toBeNull();
    expect(decodeReport(encode({ v: 1, k: null, a: 1, r: [{ t: "face", f: "normal", s: "", m: { x: "1" } }] }))).toBeNull();
    expect(decodeReport(encode({ v: 1, k: "<script>", a: 1, r: [] }))).toBeNull();
  });
});
