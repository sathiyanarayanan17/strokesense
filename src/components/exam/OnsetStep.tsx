"use client";

import { useState } from "react";

/**
 * "Last known well" is the single most important fact for the emergency team:
 * it decides which treatments are still possible.
 */
export function OnsetStep({ onDone }: { onDone: (lastKnownWell: string | null) => void }) {
  const [custom, setCustom] = useState("");

  function applyCustomTime() {
    const t = Date.parse(custom);
    if (!Number.isNaN(t)) onDone(new Date(t).toISOString());
  }

  return (
    <section aria-labelledby="onset-title" className="mx-auto max-w-xl space-y-6">
      <header className="space-y-2">
        <span className="inline-grid h-12 w-12 place-items-center rounded-xl bg-rose-600 text-2xl font-black text-white" aria-hidden>
          T
        </span>
        <h2 id="onset-title" className="text-2xl font-bold text-slate-900">
          When was the person last seen normal?
        </h2>
        <p className="text-slate-600">
          Doctors need this to decide on treatment. If they woke up with symptoms, use the time they went to sleep.
        </p>
      </header>

      <button
        type="button"
        onClick={() => onDone(new Date().toISOString())}
        className="w-full rounded-2xl bg-rose-600 p-5 text-left text-white shadow transition hover:bg-rose-700"
      >
        <span className="block text-lg font-semibold">Just now — symptoms started in the last few minutes</span>
        <span className="block text-sm text-rose-100">Records the current time</span>
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label htmlFor="lkw" className="block font-semibold text-slate-900">
          Earlier — pick the time
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id="lkw"
            type="datetime-local"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
          />
          <button
            type="button"
            onClick={applyCustomTime}
            disabled={!custom}
            className="rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white disabled:bg-slate-300"
          >
            Use this time
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDone(null)}
        className="w-full rounded-2xl border border-slate-300 p-4 font-semibold text-slate-700 hover:bg-slate-50"
      >
        I don&apos;t know
      </button>
    </section>
  );
}
