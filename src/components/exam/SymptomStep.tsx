"use client";

import { useState } from "react";
import { scoreReported, type ReportedAnswer, type ReportedTest } from "@/lib/scoring/reported";
import type { TestResult } from "@/lib/scoring/types";

const QUESTIONS: Array<{ id: ReportedTest; letter: string; title: string; question: string }> = [
  {
    id: "balance",
    letter: "B",
    title: "Balance",
    question: "Did they suddenly lose balance, feel very dizzy, or have trouble walking?",
  },
  {
    id: "eyes",
    letter: "E",
    title: "Eyes",
    question: "Did they suddenly lose vision in one or both eyes, or see double?",
  },
];

const OPTIONS: Array<{ value: ReportedAnswer; label: string; cls: string }> = [
  { value: "yes", label: "Yes", cls: "bg-rose-600 text-white hover:bg-rose-700" },
  { value: "no", label: "No", cls: "bg-slate-800 text-white hover:bg-slate-900" },
  { value: "unsure", label: "Not sure", cls: "bg-slate-200 text-slate-900 hover:bg-slate-300" },
];

export function SymptomStep({ onDone }: { onDone: (results: TestResult[]) => void }) {
  const [answers, setAnswers] = useState<Partial<Record<ReportedTest, ReportedAnswer>>>({});
  const complete = QUESTIONS.every((q) => answers[q.id]);

  return (
    <section aria-labelledby="symptom-title" className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 id="symptom-title" className="text-2xl font-bold text-slate-900">
          Two quick questions
        </h2>
        <p className="text-slate-600">Answer for the person you are checking. Only count problems that started suddenly.</p>
      </header>

      {QUESTIONS.map((q) => (
        <fieldset key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <legend className="sr-only">{q.title}</legend>
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-600 text-2xl font-black text-white" aria-hidden>
              {q.letter}
            </span>
            <p className="pt-1 text-lg font-semibold text-slate-900">{q.question}</p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {OPTIONS.map((o) => {
              const selected = answers[q.id] === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.value }))}
                  className={`rounded-xl py-3 font-semibold transition ${o.cls} ${
                    selected ? "ring-4 ring-rose-300 ring-offset-2" : answers[q.id] ? "opacity-50" : ""
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        disabled={!complete}
        onClick={() => onDone(QUESTIONS.map((q) => scoreReported(q.id, answers[q.id]!)))}
        className="w-full rounded-full bg-rose-600 py-4 text-lg font-bold text-white shadow hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Continue to camera checks
      </button>
    </section>
  );
}
