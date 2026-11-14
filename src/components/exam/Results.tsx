"use client";

import { assessRisk, describeOnset, type RiskTier } from "@/lib/scoring/risk";
import type { Finding, TestId, TestResult } from "@/lib/scoring/types";

// India: 112 (all emergencies) and 108 (ambulance). Adjust per deployment region.
const EMERGENCY_NUMBERS = [
  { label: "Call 108 (Ambulance)", tel: "108" },
  { label: "Call 112 (Emergency)", tel: "112" },
];

const TIER_STYLE: Record<RiskTier, string> = {
  emergency: "bg-rose-600 text-white",
  possible: "bg-amber-500 text-slate-950",
  inconclusive: "bg-slate-700 text-white",
  "no-signs": "bg-emerald-600 text-white",
};

const FINDING_STYLE: Record<Finding, { label: string; cls: string }> = {
  abnormal: { label: "Warning sign", cls: "bg-rose-100 text-rose-800 ring-rose-300" },
  borderline: { label: "Possible sign", cls: "bg-amber-100 text-amber-900 ring-amber-300" },
  normal: { label: "No sign", cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  inconclusive: { label: "Not assessed", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
};

const TEST_META: Record<TestId, { letter: string; name: string }> = {
  face: { letter: "F", name: "Face" },
  arm: { letter: "A", name: "Arms" },
  speech: { letter: "S", name: "Speech" },
};

interface Props {
  results: TestResult[];
  lastKnownWell: string | null;
  completedAt: number;
  onRestart: () => void;
}

export function Results({ results, lastKnownWell, completedAt, onRestart }: Props) {
  const risk = assessRisk(results);
  const onset = describeOnset(lastKnownWell, completedAt);
  const urgent = risk.tier === "emergency" || risk.tier === "possible";

  return (
    <section aria-labelledby="result-title" className="space-y-6">
      <div className={`rounded-3xl p-6 shadow-lg sm:p-8 ${TIER_STYLE[risk.tier]}`} role="alert">
        <h2 id="result-title" className="text-3xl font-black sm:text-4xl">
          {risk.headline}
        </h2>
        <p className="mt-2 text-lg sm:text-xl">{risk.advice}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {EMERGENCY_NUMBERS.map((n) => (
            <a
              key={n.tel}
              href={`tel:${n.tel}`}
              className={`rounded-full px-6 py-3 text-center text-lg font-bold shadow ${
                urgent ? "bg-white text-rose-700 hover:bg-rose-50" : "bg-white/15 text-current ring-1 ring-current hover:bg-white/25"
              }`}
            >
              {n.label}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Last known well</h3>
        {onset ? (
          <p className="text-slate-700">
            <span className="font-semibold">{onset.label}</span> ({new Date(lastKnownWell!).toLocaleString()}). {onset.message}
          </p>
        ) : (
          <p className="text-slate-700">Unknown. Tell the emergency team when the person was last seen normal.</p>
        )}
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {results.map((r) => {
          const f = FINDING_STYLE[r.finding];
          const meta = TEST_META[r.test];
          return (
            <li key={r.test} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white" aria-hidden>
                    {meta.letter}
                  </span>
                  {meta.name}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${f.cls}`}>{f.label}</span>
              </div>
              <p className="mt-3 text-slate-700">{r.summary}</p>
              {r.quality.notes.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-500">
                  {r.quality.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {Object.keys(r.metrics).length > 0 && (
                <details className="mt-auto pt-3 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-600">Measurements</summary>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                    {Object.entries(r.metrics).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="truncate">{k}</dt>
                        <dd className="text-right font-mono">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">
        StrokeSense is a screening aid, not a diagnosis. It can miss strokes and can raise false alarms. Balance problems
        and sudden vision loss are also stroke warning signs. If in doubt, always call emergency services.
      </p>

      <div className="flex justify-center">
        <button type="button" onClick={onRestart} className="rounded-full border border-slate-300 px-6 py-2 font-semibold text-slate-700 hover:bg-slate-50">
          Start a new check
        </button>
      </div>
    </section>
  );
}
