"use client";

import { useSyncExternalStore } from "react";
import { decodeReport, type ReportData } from "@/lib/report";
import { assessRisk, describeOnset } from "@/lib/scoring/risk";
import type { Finding, TestId, TestResult } from "@/lib/scoring/types";

const NAMES: Record<TestId, string> = {
  balance: "B · Balance (reported + camera sway)",
  eyes: "E · Eyes (reported + iris tracking)",
  face: "F · Facial droop (camera)",
  arm: "A · Arm drift (camera)",
  speech: "S · Speech (microphone + bystander)",
};
const FINDING_LABEL: Record<Finding, string> = {
  abnormal: "POSITIVE",
  borderline: "Borderline",
  normal: "Negative",
  inconclusive: "Not assessed",
};
const FINDING_CLS: Record<Finding, string> = {
  abnormal: "text-rose-700 font-bold",
  borderline: "text-amber-700 font-semibold",
  normal: "text-emerald-700",
  inconclusive: "text-slate-500",
};

// The fragment never reaches the server, so read it on the client only.
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function ReportView() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => null);
  if (hash === null) return <p className="text-slate-500">Loading report…</p>;
  const report = hash.length > 1 ? decodeReport(hash.slice(1)) : null;
  if (!report) {
    return (
      <div className="rounded-2xl bg-slate-100 p-6 text-slate-700" role="alert">
        This report link is incomplete or invalid. Ask the person who ran the check to share it again.
      </div>
    );
  }
  return <Report report={report} />;
}

function Report({ report }: { report: ReportData }) {
  const full = report.results.map((r) => ({ ...r, score: 0, quality: { validSamples: 0, totalSamples: 0, notes: [] } }) as TestResult);
  const risk = assessRisk(full);
  const onset = describeOnset(report.lastKnownWell, report.completedAt);
  const sorted = [...report.results].sort(
    (a, b) => Object.keys(NAMES).indexOf(a.test) - Object.keys(NAMES).indexOf(b.test),
  );

  return (
    <article className="space-y-6 print:space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">Prehospital stroke screen</p>
          <h1 className="text-3xl font-black text-slate-900">StrokeSense handoff report</h1>
          <p className="text-slate-600">Check completed {new Date(report.completedAt).toLocaleString()}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-slate-900 px-5 py-2 font-semibold text-white hover:bg-slate-800 print:hidden"
        >
          Print / save PDF
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Screen result</h2>
          <p className={`text-2xl font-black ${risk.tier === "emergency" ? "text-rose-700" : "text-slate-900"}`}>{risk.headline}</p>
          <p className="mt-1 text-sm text-slate-600">
            Positive: {risk.positiveTests.length ? risk.positiveTests.join(", ") : "none"} · Borderline:{" "}
            {risk.borderlineTests.length ? risk.borderlineTests.join(", ") : "none"} · Not assessed:{" "}
            {risk.inconclusiveTests.length ? risk.inconclusiveTests.join(", ") : "none"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Last known well</h2>
          {onset ? (
            <>
              <p className="text-2xl font-black text-slate-900">{new Date(report.lastKnownWell!).toLocaleString()}</p>
              <p className="text-sm text-slate-600">
                {onset.hours} h {onset.minutes} min before the check was completed.
              </p>
            </>
          ) : (
            <p className="text-2xl font-black text-slate-900">Unknown</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-slate-900">BE-FAST findings</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Finding</th>
                <th className="p-3">Detail</th>
                <th className="p-3">Measurements</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {sorted.map((r) => (
                <tr key={r.test}>
                  <td className="p-3 font-semibold text-slate-900">{NAMES[r.test]}</td>
                  <td className={`p-3 ${FINDING_CLS[r.finding]}`}>
                    {FINDING_LABEL[r.finding]}
                    {r.weakerSide ? ` (${r.weakerSide})` : ""}
                  </td>
                  <td className="p-3 text-slate-700">{r.summary}</td>
                  <td className="p-3 font-mono text-xs text-slate-600">
                    {Object.entries(r.metrics)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        <h2 className="font-semibold text-slate-800">Method and limitations</h2>
        <p className="mt-1">
          Face and arm findings come from on-device landmark tracking (MediaPipe). Facial asymmetry is the relative
          difference in mouth-corner excursion from rest to smile; arm drift is the change in wrist height relative to
          the shoulder line over a 10-second hold, in shoulder-width units. Speech combines word error rate on the
          Cincinnati sentence, pause ratio and bystander judgement. Balance combines the bystander report with lateral sway, trunk tilt and stepping from body tracking; eyes combine the report with iris-tracked gaze excursion and resting deviation.
          Thresholds are provisional and not clinically validated. This screen supports, and does not replace, clinical
          assessment (e.g. NIHSS) and imaging. &ldquo;Left&rdquo; and &ldquo;right&rdquo; refer to the patient&apos;s own sides.
        </p>
      </section>
    </article>
  );
}
