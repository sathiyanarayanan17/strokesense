import Link from "next/link";

const STEPS = [
  { letter: "F", title: "Face", text: "Face-mesh tracking measures how evenly each side of the mouth moves when smiling." },
  { letter: "A", title: "Arms", text: "Body-pose tracking detects one arm drifting down — a camera version of the pronator-drift test." },
  { letter: "S", title: "Speech", text: "Checks a standard sentence for wrong words, slurring and pauses, plus your own judgement." },
  { letter: "T", title: "Time", text: "Records when the person was last seen normal — the fact doctors need most." },
];

const FACTS = [
  { value: "60 sec", label: "guided check" },
  { value: "0 frames", label: "of video leave the device" },
  { value: "No app", label: "to install — works in the browser" },
];

export default function Home() {
  return (
    <main className="flex-1">
      <section className="bg-gradient-to-b from-rose-50 to-white">
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:pt-16">
          <p className="text-lg font-black tracking-tight text-slate-900">
            Stroke<span className="text-rose-600">Sense</span>
          </p>
          <h1 className="mt-10 max-w-3xl text-4xl font-black leading-tight text-slate-900 sm:text-6xl">
            Spot a stroke in 60 seconds, with just a phone.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600 sm:text-xl">
            In a stroke, every minute counts. StrokeSense guides anyone through the BE-FAST checks using the camera and
            microphone, measures the warning signs, and tells you when to call for help.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/exam"
              className="rounded-full bg-rose-600 px-8 py-4 text-center text-lg font-bold text-white shadow-lg transition hover:bg-rose-700"
            >
              Start stroke check
            </Link>
            <a
              href="tel:108"
              className="rounded-full border-2 border-rose-600 px-8 py-4 text-center text-lg font-bold text-rose-700 hover:bg-rose-50"
            >
              Emergency? Call 108
            </a>
          </div>
          <dl className="mt-12 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div key={f.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <dt className="text-sm text-slate-500">{f.label}</dt>
                <dd className="text-2xl font-black text-slate-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16" aria-labelledby="how">
        <h2 id="how" className="text-3xl font-black text-slate-900">
          How it works
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.letter} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-600 text-2xl font-black text-white" aria-hidden>
                {s.letter}
              </span>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="text-slate-600">{s.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-900 text-slate-100" aria-labelledby="privacy">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-2">
          <div>
            <h2 id="privacy" className="text-3xl font-black">
              Private by design
            </h2>
            <p className="mt-3 text-slate-300">
              Face and body tracking run entirely in your browser using on-device AI models. No video is recorded,
              uploaded or stored.
            </p>
          </div>
          <div>
            <h2 className="text-3xl font-black">Explainable, not a black box</h2>
            <p className="mt-3 text-slate-300">
              Every result comes with the measurement behind it — for example, &ldquo;the left side of the mouth moved
              40% less&rdquo; — so families and clinicians can see why.
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-sm text-slate-500">
        StrokeSense is a screening aid and does not provide a diagnosis. If you suspect a stroke, call emergency services
        immediately.
      </footer>
    </main>
  );
}
