/** Helpers for sending the report link by WhatsApp or SMS. Nothing here talks to a server. */

/** Google Maps link for a coordinate pair. Rejects non-finite or out-of-range values. */
export function mapsLink(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** `sms:?body=` works on Android and current iOS; the user picks the recipient. */
export function smsUrl(text: string): string {
  return `sms:?body=${encodeURIComponent(text)}`;
}
