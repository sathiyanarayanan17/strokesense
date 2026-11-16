/**
 * Emergency numbers by country, chosen from the phone's settings.
 *
 * A wrong number is dangerous, so this is a small, reviewed table. The user can always override the
 * country in the settings bar, and India (the app's home market) is the fallback. 112 works on most
 * mobile networks worldwide and is included wherever it is a valid emergency number.
 */

export interface Region {
  name: string;
  /** Ordered: the first number is the primary one for a medical emergency. */
  numbers: string[];
}

export const REGIONS: Record<string, Region> = {
  IN: { name: "India", numbers: ["108", "112"] },
  US: { name: "United States", numbers: ["911"] },
  CA: { name: "Canada", numbers: ["911"] },
  GB: { name: "United Kingdom", numbers: ["999", "112"] },
  IE: { name: "Ireland", numbers: ["999", "112"] },
  AU: { name: "Australia", numbers: ["000", "112"] },
  NZ: { name: "New Zealand", numbers: ["111"] },
  SG: { name: "Singapore", numbers: ["995", "999"] },
  MY: { name: "Malaysia", numbers: ["999", "112"] },
  ZA: { name: "South Africa", numbers: ["10177", "112"] },
  EU: { name: "European Union (other)", numbers: ["112"] },
};

export const DEFAULT_REGION = "IN";

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

/** Maps a country code to a key of REGIONS, or null if we do not know it. */
export function regionForCountry(country: string | null | undefined): string | null {
  const c = country?.toUpperCase();
  if (!c) return null;
  if (isRegionKey(c) && c !== "EU") return c;
  if (EU_COUNTRIES.has(c)) return "EU";
  return null;
}

/**
 * Detects the region from the browser locale (e.g. "en-GB") and time zone. Many phones in India use an
 * en-US or en-GB locale, so an Indian time zone wins over the language setting.
 */
export function detectRegion(locale: string | undefined, timeZone: string | undefined): string | null {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return "IN";
  const match = locale?.match(/[-_]([A-Za-z]{2})\b/);
  return regionForCountry(match?.[1]);
}

export function numbersFor(region: string | null | undefined): string[] {
  return (REGIONS[region ?? ""] ?? REGIONS[DEFAULT_REGION]).numbers;
}

export function isRegionKey(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REGIONS, v);
}
