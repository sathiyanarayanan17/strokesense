"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { BALANCE_LANDMARKS, couldNotStand, scoreBalance, type BalanceFrame } from "@/lib/scoring/balance";
import type { TestResult } from "@/lib/scoring/types";
import { getPoseLandmarker } from "@/lib/vision";
import { speak } from "@/lib/voice";
import { useCamera, useFrameLoop } from "./camera";
import { CameraStage, PhaseTimer } from "./CameraStage";
import { drawPoints, drawSegments, prepareCanvas, toPixels } from "./draw";
import { TestShell } from "./TestShell";

type Stage = "safety" | "ready" | "position" | "hold" | "done";

const HOLD_MS = 10_000;
const POSITION_TIMEOUT_MS = 10_000;
const IN_VIEW_STABLE_MS = 1000;

const SKELETON: Array<[number, number]> = [
  [11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [12, 14],
];

function fullBodyVisible(pts: Array<{ visibility?: number }> | null) {
  if (!pts) return false;
  return Object.values(BALANCE_LANDMARKS).every((i) => (pts[i]?.visibility ?? 0) >= 0.5);
}

export function BalanceTest({ onComplete }: { onComplete: (r: TestResult) => void }) {
  const { videoRef, status, error, retry } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarker = useRef<PoseLandmarker | null>(null);
  const frames = useRef<BalanceFrame[]>([]);
  const stageRef = useRef<Stage>("safety");
  const holdStart = useRef(0);
  const inViewSince = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastUiAt = useRef(0);

  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [stage, setStage] = useState<Stage>("safety");
  const [inView, setInView] = useState(false);

  useEffect(() => {
    let alive = true;
    getPoseLandmarker()
      .then((l) => {
        if (!alive) return;
        landmarker.current = l;
        setModelState("ready");
      })
      .catch((e) => {
        console.error(e);
        if (alive) setModelState("error");
      });
    return () => {
      alive = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  function go(next: Stage) {
    stageRef.current = next;
    setStage(next);
  }

  function beginHold(now: number) {
    if (stageRef.current !== "position") return;
    timers.current.forEach(clearTimeout);
    holdStart.current = now;
    frames.current = [];
    go("hold");
    speak("Good. Stand still with your feet together for ten seconds.");
    timers.current = [
      setTimeout(() => {
        go("done");
        speak("Well done. You can relax.");
        onComplete(scoreBalance(frames.current));
      }, HOLD_MS),
    ];
  }

  function start() {
    inViewSince.current = null;
    go("position");
    speak("Stand up, feet together, arms by your sides. Step back until your whole body is on the screen.");
    timers.current = [setTimeout(() => beginHold(performance.now()), POSITION_TIMEOUT_MS)];
  }

  useFrameLoop(videoRef, status === "ready" && modelState === "ready" && stage !== "safety", (video, now) => {
    const res = landmarker.current?.detectForVideo(video, now);
    const ctx = prepareCanvas(canvasRef.current, video);
    const lm = res?.landmarks?.[0];
    const pts = lm ? toPixels(lm, video) : null;
    const visible = fullBodyVisible(pts);

    if (pts && ctx) {
      const w = video.videoWidth / 200;
      drawSegments(ctx, pts, SKELETON, visible ? "rgba(52, 211, 153, 0.9)" : "rgba(148, 210, 255, 0.85)", w);
      const B = BALANCE_LANDMARKS;
      drawPoints(ctx, [pts[B.leftAnkle], pts[B.rightAnkle]], "#f43f5e", w * 1.6);
    }

    const s = stageRef.current;
    if (s === "position") {
      if (!visible) inViewSince.current = null;
      else if (inViewSince.current === null) inViewSince.current = now;
      else if (now - inViewSince.current > IN_VIEW_STABLE_MS) beginHold(now);
    } else if (s === "hold" && pts) {
      frames.current.push({ t: now - holdStart.current, points: pts });
    }

    if (now - lastUiAt.current > 200) {
      lastUiAt.current = now;
      setInView(visible);
    }
  });

  return (
    <TestShell
      letter="B"
      title="Balance"
      description="We measure how steadily the person stands. Swaying, leaning to one side, or needing to step can be a sign of stroke."
      instructions={[
        "Prop the phone up about 2–3 metres away so the whole body, head to feet, is visible.",
        "The person stands with feet together and arms by their sides.",
        "Stay right next to them the whole time, ready to catch them.",
      ]}
    >
      {stage === "safety" && (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h3 className="text-lg font-bold text-amber-900">Safety first</h3>
          <p className="mt-1 text-amber-900">
            People having a stroke can fall. Only do this check if they can stand safely, and stand beside them. If they
            cannot stand at all, that is a warning sign in itself.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => go("ready")}
              className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white hover:bg-slate-800"
            >
              I am next to them — they can stand
            </button>
            <button
              type="button"
              onClick={() => onComplete(couldNotStand())}
              className="rounded-full bg-rose-600 px-6 py-3 font-semibold text-white hover:bg-rose-700"
            >
              They cannot stand safely
            </button>
          </div>
        </div>
      )}
      {/* Always mounted so the shared camera stream can attach; hidden during the safety step. */}
      <div className={stage === "safety" ? "hidden" : ""}>
          <CameraStage videoRef={videoRef} canvasRef={canvasRef} status={status} error={error} onRetry={retry}>
            <div className="absolute inset-x-0 top-0 p-3">
              <span
                className={`inline-block rounded-full px-3 py-1 text-sm font-medium text-white ${
                  modelState !== "ready" ? "bg-slate-700/80" : inView ? "bg-emerald-600/90" : "bg-amber-500/90"
                }`}
                role="status"
              >
                {modelState !== "ready" ? "Loading body model…" : inView ? "Whole body in view" : "Step back — feet must be visible"}
              </span>
            </div>
            {(stage === "position" || stage === "hold") && (
              <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
                <p className="text-center text-xl font-semibold sm:text-2xl" aria-live="assertive">
                  {stage === "position" ? "Stand with feet together, whole body in view" : "Stand still"}
                </p>
                {stage === "hold" && <PhaseTimer ms={HOLD_MS} phaseKey="balance-hold" />}
              </div>
            )}
          </CameraStage>
          <div className="mt-4 flex justify-center">
            {stage === "ready" && (
              <button
                type="button"
                onClick={start}
                disabled={modelState !== "ready" || status !== "ready"}
                className="rounded-full bg-rose-600 px-8 py-3 text-lg font-semibold text-white shadow transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {modelState === "loading" ? "Loading body model…" : "Start balance check"}
              </button>
            )}
            {modelState === "error" && (
              <p className="text-red-600" role="alert">
                The body-tracking model could not load. Reload the page to retry.
              </p>
            )}
          </div>
      </div>
    </TestShell>
  );
}
