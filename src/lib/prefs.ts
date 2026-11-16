"use client";

import { useSyncExternalStore } from "react";
import { detectRegion, isRegionKey, numbersFor } from "./emergency";

/**
 * Display and voice preferences. Kept in localStorage on this device only, never sent anywhere.
 * `region: null` means "detect from the phone".
 */
export interface Prefs {
  large: boolean;
  contrast: boolean;
  voice: boolean;
  region: string | null;
}

export const DEFAULT_PREFS: Prefs = { large: false, contrast: false, voice: true, region: null };
const KEY = "strokesense.prefs";

/** Validates untrusted stored data field by field; anything invalid falls back to the default. */
export function parsePrefs(raw: unknown): Prefs {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  return {
    large: r.large === true,
    contrast: r.contrast === true,
    voice: r.voice !== false,
    region: isRegionKey(r.region) ? r.region : null,
  };
}

let current: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function apply(p: Prefs) {
  const el = document.documentElement;
  el.dataset.text = p.large ? "large" : "normal";
  el.dataset.contrast = p.contrast ? "high" : "normal";
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    current = parsePrefs(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    current = DEFAULT_PREFS; // corrupt or unavailable storage
  }
  apply(current);
}

export function getPrefs(): Prefs {
  load();
  return current;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  load();
  current = { ...current, [key]: value };
  apply(current);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: the setting still applies for this visit */
  }
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS);
}

export function isVoiceEnabled(): boolean {
  return getPrefs().voice;
}

/** Emergency numbers for the chosen or detected country. Server render and first paint use India. */
export function useEmergencyNumbers(): string[] {
  const prefs = usePrefs();
  const detected = useSyncExternalStore(
    () => () => {},
    () => detectRegion(navigator.language, Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => null,
  );
  return numbersFor(prefs.region ?? detected);
}
