"use client";

import { useEffect, useRef, useState } from "react";
import { directionsUrl, findHospitals, type Hospital } from "@/lib/hospitals";

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "searching" }
  | { kind: "done"; hospitals: Hospital[] }
  | { kind: "error"; message: string };

export function NearbyHospitals() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
    };
  }, []);

  function search() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "error", message: "This browser cannot share your location." });
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setState({ kind: "searching" });
        abort.current?.abort();
        const ctrl = new AbortController();
        abort.current = ctrl;
        const timeout = setTimeout(() => ctrl.abort(), 25_000);
        try {
          const hospitals = await findHospitals(coords.latitude, coords.longitude, ctrl.signal);
          if (mounted.current) setState({ kind: "done", hospitals });
        } catch (e) {
          if (!mounted.current) return;
          console.error(e);
          setState({ kind: "error", message: "Hospital search is unavailable right now. Call 108 — the ambulance team knows the nearest stroke-ready hospital." });
        } finally {
          clearTimeout(timeout);
        }
      },
      (err) =>
        setState({
          kind: "error",
          message: err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Could not get your location.",
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <section aria-labelledby="hosp-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="hosp-title" className="text-lg font-bold text-slate-900">
        Nearby hospitals
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Calling an ambulance is safest: the crew can start care on the way and take the person to a hospital that treats
        strokes. If you must travel yourself, call the hospital ahead.
      </p>

      {state.kind === "idle" && (
        <button type="button" onClick={search} className="mt-4 rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800">
          Find hospitals near me
        </button>
      )}
      {(state.kind === "locating" || state.kind === "searching") && (
        <p className="mt-4 text-slate-600" role="status">
          {state.kind === "locating" ? "Getting your location…" : "Searching OpenStreetMap…"}
        </p>
      )}
      {state.kind === "error" && (
        <div className="mt-4 space-y-2">
          <p className="text-rose-700" role="alert">
            {state.message}
          </p>
          <button type="button" onClick={search} className="text-sm font-semibold text-slate-700 underline">
            Try again
          </button>
        </div>
      )}
      {state.kind === "done" &&
        (state.hospitals.length === 0 ? (
          <p className="mt-4 text-slate-600">No hospitals found nearby on the map. Call 108.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {state.hospitals.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{h.name}</p>
                  <p className="text-sm text-slate-500">
                    {h.distanceKm.toFixed(1)} km away (straight line)
                    {h.emergency ? " · emergency department mapped" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {h.phone && (
                    <a href={`tel:${h.phone.replace(/[^\d+]/g, "")}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                      Call
                    </a>
                  )}
                  <a
                    href={directionsUrl(h)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Directions
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ))}
      <p className="mt-3 text-xs text-slate-400">
        Your location is sent only to OpenStreetMap&apos;s Overpass service to search for hospitals. Map data © OpenStreetMap contributors.
      </p>
    </section>
  );
}
