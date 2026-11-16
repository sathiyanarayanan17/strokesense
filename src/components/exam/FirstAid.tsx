"use client";

import { DICTS, type Lang } from "@/lib/i18n";

/** Fixed first-aid steps for the minutes before the ambulance arrives. Text comes only from i18n templates. */
export function FirstAid({ lang }: { lang: Lang }) {
  const d = DICTS[lang];
  return (
    <section aria-labelledby="firstaid-title" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <h3 id="firstaid-title" className="text-lg font-bold text-rose-900">
        {d.firstAidTitle}
      </h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-800">
        {d.firstAid.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
