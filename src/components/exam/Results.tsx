"use client";

import { useMemo, useState } from "react";
import { DICTS, explainResult, LANGS, type Lang } from "@/lib/i18n";
import { buildReport, encodeReport } from "@/lib/report";
import { assessRisk, describeOnset, type RiskTier } from "@/lib/scoring/risk";
import type { Finding, TestId, TestResult } from "@/lib/scoring/types";
import { useNow } from "@/lib/useNow";
import { findVoice, speak } from "@/lib/voice";
import { FirstAid } from "./FirstAid";
import { NearbyHospitals } from "./NearbyHospitals";
import { ReportShare } from "./ReportShare";
import { ShareToContacts } from "./ShareToContacts";

const TIER_STYLE: Record<RiskTier, string> = {
  emergency: "bg-rose-600 text-white",
  possible: "bg-amber-500 text-slate-950",
  inconclusive: "bg-slate-700 text-white",
  "no-signs": "bg-emerald-600 text-white",
};

const FINDING_STYLE: Record<Finding, string> = {
  abnormal: "bg-rose-100 text-rose-800 ring-rose-300",
  borderline: "bg-amber-100 text-amber-900 ring-amber-300",
  normal: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  inconclusive: "bg-slate-100 text-slate-700 ring-slate-300",
};

const LETTER: Record<TestId, string> = { balance: "B", eyes: "E", face: "F", arm: "A", speech: "S" };
const ORDER: TestId[] = ["balance", "eyes", "face", "arm", "speech"];

interface Props {
  results: TestResult[];
  lastKnownWell: string | null;
  completedAt: number;
  onRestart: () => void;
}

export function Results({ results, lastKnownWell, completedAt, onRestart }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const d = DICTS[lang];
  const risk = assessRisk(results);
  const now = useNow(completedAt);
  const onset = describeOnset(lastKnownWell, now);
  const reportUrl = useMemo(
    () =>
      typeof window === "undefined" ? null : `${window.location.origin}/report#${encodeReport(buildReport(results, lastKnownWell, completedAt))}`,
    [results, lastKnownWell, completedAt],
  );
  const urgent = risk.tier === "emergency" || risk.tier === "possible";
  const sorted = [...results].sort((a, b) => ORDER.indexOf(a.test) - ORDER.indexOf(b.test));
  const tierText = d.tier[risk.tier];

  function readAloud() {
    const speechLang = LANGS.find((l) => l.code === lang)!.speechLang;
    if (lang !== "en" && !findVoice(speechLang)) {
      setVoiceMsg(d.noVoice);
      return;
    }
    setVoiceMsg(null);
    const findings = sorted.filter((r) => r.finding === "abnormal" || r.finding === "borderline").map((r) => explainResult(r, lang));
    speak([tierText.headline, tierText.advice, ...findings].join(". "), undefined, 5000, speechLang);
  }

  return (
    <section aria-labelledby="result-title" className="space-y-6" lang={lang}>
      <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={lang === l.code}
            onClick={() => setLang(l.code)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              lang === l.code ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className={`rounded-3xl p-6 shadow-lg sm:p-8 ${TIER_STYLE[risk.tier]}`} role="alert">
        <h2 id="result-title" className="text-3xl font-black sm:text-4xl">
          {tierText.headline}
        </h2>
        <p className="mt-2 text-lg sm:text-xl">{tierText.advice}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {[
            { tel: "108", label: d.call108 },
            { tel: "112", label: d.call112 },
          ].map((n) => (
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
          <button
            type="button"
            onClick={readAloud}
            className="rounded-full bg-black/15 px-6 py-3 text-lg font-semibold ring-1 ring-current hover:bg-black/25"
          >
            🔊 {d.readAloud}
          </button>
        </div>
        {voiceMsg && <p className="mt-3 text-sm">{voiceMsg}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">{onset ? d.elapsedTitle : d.lastKnownWell}</h3>
        {onset ? (
          <p className="text-slate-700">
            <span className="font-semibold">{d.ago(onset.hours, onset.minutes)}</span> ({new Date(lastKnownWell!).toLocaleString()}).{" "}
            {d.onset[onset.window]}
          </p>
        ) : (
          <p className="text-slate-700">{d.onsetUnknown}</p>
        )}
      </div>

      {urgent && <FirstAid lang={lang} />}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((r) => (
          <li key={r.test} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-white" aria-hidden>
                  {LETTER[r.test]}
                </span>
                {d.test[r.test]}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${FINDING_STYLE[r.finding]}`}>{d.finding[r.finding]}</span>
            </div>
            <p className="mt-3 text-slate-800">{explainResult(r, lang)}</p>
            <details className="mt-auto pt-3 text-sm" lang="en">
              <summary className="cursor-pointer font-medium text-slate-600">Clinical details</summary>
              <p className="mt-2 text-slate-600">{r.summary}</p>
              {r.quality.notes.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-slate-500">
                  {r.quality.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {Object.keys(r.metrics).length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                  {Object.entries(r.metrics).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="truncate">{k}</dt>
                      <dd className="text-right font-mono">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </details>
          </li>
        ))}
      </ul>

      <ShareToContacts lang={lang} headline={tierText.headline} ago={onset ? d.ago(onset.hours, onset.minutes) : null} reportUrl={reportUrl} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportShare results={results} lastKnownWell={lastKnownWell} completedAt={completedAt} />
        <NearbyHospitals />
      </div>

      <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">{d.disclaimer}</p>

      <div className="flex justify-center">
        <button type="button" onClick={onRestart} className="rounded-full border border-slate-300 px-6 py-2 font-semibold text-slate-700 hover:bg-slate-50">
          Start a new check
        </button>
      </div>
    </section>
  );
}
