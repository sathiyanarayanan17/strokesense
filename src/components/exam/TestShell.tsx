import type { ReactNode } from "react";

interface Props {
  letter: string;
  title: string;
  description: string;
  instructions: string[];
  children: ReactNode;
}

export function TestShell({ letter, title, description, instructions, children }: Props) {
  return (
    <section aria-labelledby={`test-${letter}`} className="space-y-4">
      <header className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-rose-600 text-2xl font-black text-white" aria-hidden>
          {letter}
        </span>
        <div>
          <h2 id={`test-${letter}`} className="text-2xl font-bold text-slate-900">
            {title}
          </h2>
          <p className="text-slate-600">{description}</p>
        </div>
      </header>
      <ol className="list-decimal space-y-1 pl-6 text-sm text-slate-700">
        {instructions.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ol>
      {children}
    </section>
  );
}
