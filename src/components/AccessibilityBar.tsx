"use client";

import { useEffect, useState } from "react";

const KEY = "strokesense.a11y";

interface Prefs {
  large: boolean;
  contrast: boolean;
}

function apply(p: Prefs) {
  const el = document.documentElement;
  el.dataset.text = p.large ? "large" : "normal";
  el.dataset.contrast = p.contrast ? "high" : "normal";
}

/** Larger text and high contrast. Preferences are kept on this device only (localStorage). */
export function AccessibilityBar() {
  const [prefs, setPrefs] = useState<Prefs>({ large: false, contrast: false });

  useEffect(() => {
    let saved: Prefs | null = null;
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (raw && typeof raw.large === "boolean" && typeof raw.contrast === "boolean") saved = raw;
    } catch {
      /* ignore corrupt or unavailable storage */
    }
    if (saved) {
      apply(saved);
      const id = setTimeout(() => setPrefs(saved), 0);
      return () => clearTimeout(id);
    }
  }, []);

  function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the setting still applies for this visit */
    }
  }

  const btn = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 ${on ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`;

  return (
    <div className="flex justify-end gap-2 px-4 pt-2" role="group" aria-label="Display options">
      <button type="button" aria-pressed={prefs.large} onClick={() => toggle("large")} className={btn(prefs.large)}>
        A+ Larger text
      </button>
      <button type="button" aria-pressed={prefs.contrast} onClick={() => toggle("contrast")} className={btn(prefs.contrast)}>
        ◐ High contrast
      </button>
    </div>
  );
}
