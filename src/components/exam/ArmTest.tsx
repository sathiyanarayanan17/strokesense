"use client";

import { useEffect, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { armHeights, POSE_LANDMARKS, scoreArms, type ArmFrame } from "@/lib/scoring/arm";
import type { TestResult } from "@/lib/scoring/types";
import { getPoseLandmarker } from "@/lib/vision";
import { speak } from "@/lib/voice";
import { useCamera, useFrameLoop } from "./camera";
import { CameraStage, PhaseTimer } from "./CameraStage";
import { drawPoints, drawSegments, prepareCanvas, toPixels } from "./draw";
import { TestShell } from "./TestShell";

type Stage = "ready" | "position" | "hold" | "done";

const HOLD_MS = 10_000;
const POSITION_TIMEOUT_MS = 7_000; // start anyway: an arm that can't be raised IS the finding
const RAISED_HEIGHT = -0.35; // wrist no lower than this (shoulder-width units) counts as raised
const RAISED_STABLE_MS = 800;

// Upper-body skeleton for the overlay.
const SKELETON: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
];

export function ArmTest({ onComplete }: { onComplete: (r: TestResult) => void }) {
  const { videoRef, status, error } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarker = useRef<PoseLandmarker | null>(null);
  const frames = useRef<ArmFrame[]>([]);
  const stageRef = useRef<Stage>("ready");
  const holdStart = useRef(0);
  const raisedSince = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastUiAt = useRef(0);

  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [stage, setStage] = useState<Stage>("ready");
  const [heights, setHeights] = useState<{ left: number; right: number } | null>(null);

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
    speak("Good. Close your eyes and keep both arms still.");
    timers.current = [
      setTimeout(() => {
        go("done");
        speak("You can lower your arms.");
        onComplete(scoreArms(frames.current));
      }, HOLD_MS),
    ];
  }

  function start() {
    raisedSince.current = null;
    go("position");
    speak("Raise both arms straight out in front of you, at shoulder height, palms up.");
    timers.current = [setTimeout(() => beginHold(performance.now()), POSITION_TIMEOUT_MS)];
  }

  useFrameLoop(videoRef, status === "ready" && modelState === "ready", (video, now) => {
    const res = landmarker.current?.detectForVideo(video, now);
    const ctx = prepareCanvas(canvasRef.current, video);
    const lm = res?.landmarks?.[0];
    const pts = lm ? toPixels(lm, video) : null;
    const h = pts ? armHeights(pts) : null;

    if (pts && ctx) {
      const w = video.videoWidth / 160;
      drawSegments(ctx, pts, SKELETON, "rgba(148, 210, 255, 0.85)", w);
      const P = POSE_LANDMARKS;
      drawPoints(ctx, [pts[P.leftWrist], pts[P.rightWrist]], "#f43f5e", w * 1.6);
      drawPoints(ctx, [pts[P.leftShoulder], pts[P.rightShoulder]], "#facc15", w * 1.3);
    }

    const s = stageRef.current;
    if (s === "position") {
      const raised = h && h.left > RAISED_HEIGHT && h.right > RAISED_HEIGHT;
      if (!raised) raisedSince.current = null;
      else if (raisedSince.current === null) raisedSince.current = now;
      else if (now - raisedSince.current > RAISED_STABLE_MS) beginHold(now);
    } else if (s === "hold" && pts) {
      frames.current.push({ t: now - holdStart.current, points: pts });
    }

    if (now - lastUiAt.current > 100) {
      lastUiAt.current = now;
      setHeights(h);
    }
  });

  return (
    <TestShell
      letter="A"
      title="Arms"
      description="We track both wrists while the arms are held out. A weak arm slowly drifts down, or cannot be raised."
      instructions={[
        "Prop the phone up, then sit or stand back so the head, shoulders and hands are all visible.",
        "Raise both arms straight out in front at shoulder height, palms facing up.",
        "Close the eyes and hold still for 10 seconds.",
      ]}
    >
      <CameraStage videoRef={videoRef} canvasRef={canvasRef} status={status} error={error}>
        <ArmMeters heights={heights} />
        {(stage === "position" || stage === "hold") && (
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
            <p className="text-center text-xl font-semibold sm:text-2xl" aria-live="assertive">
              {stage === "position" ? "Raise both arms to shoulder height" : "Eyes closed — hold still"}
            </p>
            {stage === "hold" && <PhaseTimer ms={HOLD_MS} phaseKey="hold" />}
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
            {modelState === "loading" ? "Loading body model…" : "Start arm check"}
          </button>
        )}
        {modelState === "error" && (
          <p className="text-red-600" role="alert">
            The body-tracking model could not load. Reload the page to retry.
          </p>
        )}
      </div>
    </TestShell>
  );
}

/** Live wrist-height meters. Mirrored view: the person's left arm appears on the left of the screen. */
function ArmMeters({ heights }: { heights: { left: number; right: number } | null }) {
  const pct = (v: number) => Math.round(Math.min(1, Math.max(0, (v + 1) / 1.4)) * 100);
  return (
    <div className="pointer-events-none absolute inset-y-4 inset-x-3 flex justify-between" aria-hidden>
      {(["left", "right"] as const).map((side) => (
        <div key={side} className="flex w-10 flex-col items-center gap-1">
          <div className="relative w-3 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="absolute inset-x-0 bottom-0 rounded-full bg-emerald-400 transition-[height] duration-100"
              style={{ height: heights ? `${pct(heights[side])}%` : "0%" }}
            />
            {/* shoulder level marker */}
            <div className="absolute inset-x-0 h-0.5 bg-yellow-300" style={{ bottom: `${pct(0)}%` }} />
          </div>
          <span className="rounded bg-black/50 px-1 text-xs font-medium capitalize text-white">{side}</span>
        </div>
      ))}
    </div>
  );
}
