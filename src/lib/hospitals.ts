/**
 * Nearby hospitals from OpenStreetMap (Overpass API). Free, no API key.
 * OSM does not reliably say which hospitals have stroke units, so the UI tells
 * users that the ambulance service will choose the right hospital.
 */

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  phone?: string;
  emergency?: boolean;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function buildQuery(lat: number, lon: number, radiusM: number): string {
  // Coordinates are numbers we formatted ourselves; no user text enters the query.
  const f = (n: number) => n.toFixed(5);
  return `[out:json][timeout:20];nwr["amenity"="hospital"](around:${Math.round(radiusM)},${f(lat)},${f(lon)});out center tags 40;`;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseHospitals(json: unknown, lat: number, lon: number, limit = 8): Hospital[] {
  const elements = (json as { elements?: OverpassElement[] })?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const out: Hospital[] = [];
  for (const el of elements) {
    const hLat = el.lat ?? el.center?.lat;
    const hLon = el.lon ?? el.center?.lon;
    const name = el.tags?.name?.trim();
    if (typeof hLat !== "number" || typeof hLon !== "number" || !name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue; // same hospital mapped as node + building
    seen.add(key);
    out.push({
      id: `${el.type}/${el.id}`,
      name,
      lat: hLat,
      lon: hLon,
      distanceKm: distanceKm(lat, lon, hLat, hLon),
      phone: el.tags?.phone ?? el.tags?.["contact:phone"],
      emergency: el.tags?.emergency === "yes" ? true : el.tags?.emergency === "no" ? false : undefined,
    });
  }
  // Hospitals with a mapped emergency department first, then by distance.
  return out
    .sort((a, b) => Number(b.emergency === true) - Number(a.emergency === true) || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export async function findHospitals(lat: number, lon: number, signal?: AbortSignal): Promise<Hospital[]> {
  for (const radius of [5000, 15000, 40000]) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: `data=${encodeURIComponent(buildQuery(lat, lon, radius))}`,
      signal,
    });
    if (!res.ok) throw new Error(`Hospital search failed (HTTP ${res.status})`);
    const hospitals = parseHospitals(await res.json(), lat, lon);
    if (hospitals.length >= 3 || radius === 40000) return hospitals;
  }
  return [];
}

export function directionsUrl(h: Hospital): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`;
}
