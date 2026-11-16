"use client";

import { REGIONS } from "@/lib/emergency";
import { setPref, useEmergencyNumbers, usePrefs } from "@/lib/prefs";
import { stopSpeaking } from "@/lib/voice";

/** Display, voice and country options. Preferences are kept on this device only (localStorage). */
export function AccessibilityBar() {
  const prefs = usePrefs();
  const numbers = useEmergencyNumbers();

  const btn = (on: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 ${on ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2 print:hidden" role="group" aria-label="Display and voice options">
      <button type="button" aria-pressed={prefs.large} onClick={() => setPref("large", !prefs.large)} className={btn(prefs.large)}>
        A+ Larger text
      </button>
      <button type="button" aria-pressed={prefs.contrast} onClick={() => setPref("contrast", !prefs.contrast)} className={btn(prefs.contrast)}>
        ◐ High contrast
      </button>
      <button
        type="button"
        aria-pressed={prefs.voice}
        onClick={() => {
          if (prefs.voice) stopSpeaking();
          setPref("voice", !prefs.voice);
        }}
        className={btn(prefs.voice)}
      >
        🔊 Voice guidance
      </button>
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
        Country
        <select
          value={prefs.region ?? ""}
          onChange={(e) => setPref("region", e.target.value || null)}
          className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-300"
          title={`Emergency numbers: ${numbers.join(", ")}`}
        >
          <option value="">Auto ({numbers.join(" / ")})</option>
          {Object.entries(REGIONS).map(([code, r]) => (
            <option key={code} value={code}>
              {r.name} ({r.numbers.join(" / ")})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
