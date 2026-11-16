"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildReport, encodeReport } from "@/lib/report";
import type { TestResult } from "@/lib/scoring/types";

interface Props {
  results: TestResult[];
  lastKnownWell: string | null;
  completedAt: number;
}

/** QR code + link to the clinician handoff report. The data lives in the URL fragment only. */
export function ReportShare({ results, lastKnownWell, completedAt }: Props) {
  const [share, setShare] = useState<{ url: string; qr: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const url = `${window.location.origin}/report#${encodeReport(buildReport(results, lastKnownWell, completedAt))}`;
    QRCode.toDataURL(url, { errorCorrectionLevel: "L", margin: 1, width: 280 })
      .then((qr) => alive && setShare({ url, qr }))
      .catch((e) => {
        console.error(e);
        if (alive) setShare({ url, qr: "" });
      });
    return () => {
      alive = false;
    };
  }, [results, lastKnownWell, completedAt]);

  async function shareLink() {
    if (!share) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "StrokeSense handoff report", url: share.url });
        return;
      }
      await navigator.clipboard.writeText(share.url);
      setStatus("Link copied. Paste it into WhatsApp or SMS for the hospital.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user closed the share sheet
      setStatus("Could not share automatically. Open the report and copy the address.");
    }
  }

  return (
    <section aria-labelledby="share-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 id="share-title" className="text-lg font-bold text-slate-900">
        Handoff report for the emergency team
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        Show this QR code to the ambulance or hospital staff, or send the link ahead. The results are stored inside the
        link itself â€” nothing is uploaded or saved on a server.
      </p>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="grid h-[200px] w-[200px] shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-200">
          {share?.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL generated on the device
            <img src={share.qr} alt="QR code linking to the handoff report" width={200} height={200} className="rounded-xl" />
          ) : (
            <span className="text-sm text-slate-600">{share ? "QR unavailable" : "Generatingâ€¦"}</span>
          )}
        </div>
        <div className="flex w-full flex-col gap-3">
          <a
            href={share?.url ?? "#"}
            target="_blank"
            rel="noopener"
            aria-disabled={!share}
            className="rounded-full bg-slate-900 px-6 py-3 text-center font-semibold text-white hover:bg-slate-800"
          >
            Open report
          </a>
          <button
            type="button"
            onClick={shareLink}
            disabled={!share}
            className="rounded-full border border-slate-300 px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Share link
          </button>
          {status && (
            <p className="text-sm text-slate-600" role="status">
              {status}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
