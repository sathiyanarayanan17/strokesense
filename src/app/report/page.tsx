import type { Metadata } from "next";
import Link from "next/link";
import { ReportView } from "@/components/report/ReportView";

export const metadata: Metadata = {
  title: "Handoff report · StrokeSense",
  // Reports contain health information: keep them out of search engines.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ReportPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <Link href="/" className="mb-6 inline-block text-lg font-black tracking-tight text-slate-900 print:hidden">
        Stroke<span className="text-rose-600">Sense</span>
      </Link>
      <ReportView />
    </main>
  );
}
