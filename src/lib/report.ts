import type { Finding, Side, TestId, TestResult } from "./scoring/types";

/**
 * Handoff report for the emergency team.
 *
 * The whole report is encoded into the URL *fragment* (#...). Browsers never
 * send the fragment to a server, so the report is shared by link or QR code
 * without being stored anywhere. Decoded data is treated as untrusted input
 * and validated field by field.
 */

export const REPORT_VERSION = 1;

export interface ReportData {
  version: number;
  lastKnownWell: string | null;
  completedAt: number;
  results: Array<Pick<TestResult, "test" | "finding" | "summary" | "weakerSide" | "metrics">>;
}

const TESTS: readonly TestId[] = ["balance", "eyes", "face", "arm", "speech"];
const FINDINGS: readonly Finding[] = ["normal", "borderline", "abnormal", "inconclusive"];
const SIDES: readonly Side[] = ["left", "right"];
const MAX_SUMMARY = 300;
const MAX_METRICS = 20;

interface Wire {
  v: number;
  k: string | null;
  a: number;
  r: Array<{ t: string; f: string; s: string; w?: string; m: Record<string, number> }>;
}

export function buildReport(results: TestResult[], lastKnownWell: string | null, completedAt: number): ReportData {
  return {
    version: REPORT_VERSION,
    lastKnownWell,
    completedAt,
    results: results.map(({ test, finding, summary, weakerSide, metrics }) => ({ test, finding, summary, weakerSide, metrics })),
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeReport(report: ReportData): string {
  const wire: Wire = {
    v: report.version,
    k: report.lastKnownWell,
    a: report.completedAt,
    r: report.results.map((r) => ({
      t: r.test,
      f: r.finding,
      s: r.summary,
      ...(r.weakerSide ? { w: r.weakerSide } : {}),
      m: r.metrics,
    })),
  };
  return toBase64Url(JSON.stringify(wire));
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Returns null for anything malformed, tampered or from an unknown version. */
export function decodeReport(encoded: string): ReportData | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(encoded.trim().replace(/^#/, "")));
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.v !== REPORT_VERSION) return null;
  if (typeof raw.a !== "number" || !Number.isFinite(raw.a)) return null;
  if (raw.k !== null && (typeof raw.k !== "string" || Number.isNaN(Date.parse(raw.k)))) return null;
  if (!Array.isArray(raw.r) || raw.r.length > TESTS.length) return null;

  const results: ReportData["results"] = [];
  for (const item of raw.r) {
    if (!isObj(item)) return null;
    const { t, f, s, w, m } = item;
    if (!TESTS.includes(t as TestId) || !FINDINGS.includes(f as Finding)) return null;
    if (typeof s !== "string" || s.length > MAX_SUMMARY) return null;
    if (w !== undefined && !SIDES.includes(w as Side)) return null;
    if (!isObj(m) || Object.keys(m).length > MAX_METRICS) return null;
    const metrics: Record<string, number> = {};
    for (const [key, val] of Object.entries(m)) {
      if (!/^[A-Za-z]{1,40}$/.test(key) || typeof val !== "number" || !Number.isFinite(val)) return null;
      metrics[key] = val;
    }
    results.push({ test: t as TestId, finding: f as Finding, summary: s, weakerSide: w as Side | undefined, metrics });
  }

  return { version: REPORT_VERSION, lastKnownWell: raw.k as string | null, completedAt: raw.a, results };
}
