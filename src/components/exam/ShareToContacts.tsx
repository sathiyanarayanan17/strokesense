"use client";

import { useState } from "react";
import { DICTS, type Lang } from "@/lib/i18n";
import { mapsLink, smsUrl, whatsappUrl } from "@/lib/share";

interface Props {
  lang: Lang;
  headline: string;
  ago: string | null;
  reportUrl: string | null;
}

/** One-tap WhatsApp / SMS message with the report link, and optionally the current location. */
export function ShareToContacts({ lang, headline, ago, reportUrl }: Props) {
  const d = DICTS[lang];
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function addLocation() {
    if (!("geolocation" in navigator)) {
      setStatus(d.shareLocationFailed);
      return;
    }
    setStatus(d.shareLocating);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const link = mapsLink(coords.latitude, coords.longitude);
        setMapUrl(link);
        setStatus(link ? d.shareLocationAdded : d.shareLocationFailed);
      },
      () => setStatus(d.shareLocationFailed),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  const text = reportUrl ? d.shareMessage({ headline, ago, reportUrl, mapUrl }) : null;
  const link = "rounded-full px-5 py-3 text-center font-semibold text-white";

  return (
    <section aria-labelledby="send-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="send-title" className="text-lg font-bold text-slate-900">
        {d.shareTitle}
      </h3>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={text ? whatsappUrl(text) : "#"}
          target="_blank"
          rel="noopener"
          aria-disabled={!text}
          className={`${link} bg-emerald-700 hover:bg-emerald-800 ${text ? "" : "pointer-events-none opacity-50"}`}
        >
          {d.shareWhatsapp}
        </a>
        <a
          href={text ? smsUrl(text) : "#"}
          aria-disabled={!text}
          className={`${link} bg-slate-900 hover:bg-slate-800 ${text ? "" : "pointer-events-none opacity-50"}`}
        >
          {d.shareSms}
        </a>
        <button
          type="button"
          onClick={addLocation}
          className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50"
        >
          ðŸ“ {d.shareAddLocation}
        </button>
        <button
          type="button"
          disabled={!text}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text!);
              setStatus(d.shareCopied);
            } catch {
              setStatus(d.shareCopyFailed);
            }
          }}
          className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          ðŸ“‹ {d.shareCopy}
        </button>
      </div>
      {status && (
        <p className="mt-3 text-sm text-slate-600" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
