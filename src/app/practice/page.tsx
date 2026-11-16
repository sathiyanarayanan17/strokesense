import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyCallLink } from "@/components/EmergencyCallLink";
import { ExamFlow } from "@/components/exam/ExamFlow";

export const metadata: Metadata = {
  title: "Practice run · StrokeSense",
  robots: { index: false, follow: false },
};

/** Same guided flow as /exam, but results are not shareable. For rehearsing on a calm day. */
export default function PracticePage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-black tracking-tight text-slate-900">
          Stroke<span className="text-rose-600">Sense</span>
        </Link>
        <EmergencyCallLink className="rounded-full bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-rose-700" />
      </div>
      <ExamFlow practice />
    </main>
  );
}
