"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { FACE_LANDMARKS, FACE_THRESHOLDS, scoreFace, toLocalCorners, type FaceFrame, type FacePhase } from "@/lib/scoring/face";
import type { TestResult } from "@/lib/scoring/types";
import { getFaceLandmarker } from "@/lib/vision";
import { speak } from "@/lib/voice";
import { runPhases, useCamera, useFrameLoop } from "./camera";
import { CameraStage, PhaseTimer } from "./CameraStage";
import { drawPoints, prepareCanvas, toPixels } from "./draw";
import { TestShell } from "./TestShell";

type Stage = "ready" | FacePhase | "done";

const PHASES: Array<{ name: FacePhase; ms: number; say: string; show: string }> = [
  { name: "neutral", ms: 3000, say: "Look at the camera and relax your face.", show: "Look at the camera. Relax your face." },
  { name: "smile", ms: 3500, say: "Now give a big smile and show your teeth.", show: "Big smile — show your teeth!" },
];

type Hint = "searching" | "turned" | "good";

export function FaceTest({ onComplete }: { onComplete: (r: TestResult) => void }) {
  const { videoRef, status, error, retry } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarker = useRef<FaceLandmarker | null>(null);
  const frames = useRef<FaceFrame[]>([]);
  const phase = useRef<Stage>("ready");
  const lastHintAt = useRef(0);

  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [stage, setStage] = useState<Stage>("ready");
  const [hint, setHint] = useState<Hint>("searching");

  useEffect(() => {
    let alive = true;
    getFaceLandmarker()
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
    };
  }, []);

  const cancelPhases = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelPhases.current?.(), []);

  useFrameLoop(videoRef, status === "ready" && modelState === "ready", (video, now) => {
    const res = landmarker.current?.detectForVideo(video, now);
    const ctx = prepareCanvas(canvasRef.current, video);
    const lm = res?.faceLandmarks?.[0];

    let nextHint: Hint = "searching";
    if (lm && ctx) {
      const pts = toPixels(lm, video);
      const corners = toLocalCorners(pts);
      const turned = !corners || Math.abs(corners.yaw) > FACE_THRESHOLDS.maxYaw;
      nextHint = turned ? "turned" : "good";

      drawPoints(ctx, pts, "rgba(148, 210, 255, 0.55)", Math.max(1.2, video.videoWidth / 800));
      const L = FACE_LANDMARKS;
      drawPoints(ctx, [pts[L.mouthLeft], pts[L.mouthRight]], "#f43f5e", video.videoWidth / 160);
      drawPoints(ctx, [pts[L.leftEyeOuter], pts[L.rightEyeOuter]], "#facc15", video.videoWidth / 220);

      const p = phase.current;
      if (p === "neutral" || p === "smile") frames.current.push({ phase: p, points: pts });
    }

    // Throttle React updates; the canvas already redraws every frame.
    if (now - lastHintAt.current > 250) {
      lastHintAt.current = now;
      setHint(nextHint);
    }
  });

  function start() {
    frames.current = [];
    cancelPhases.current = runPhases(
      PHASES,
      (name) => {
        phase.current = name;
        setStage(name);
        speak(PHASES.find((p) => p.name === name)!.say);
      },
      () => {
        phase.current = "done";
        setStage("done");
        onComplete(scoreFace(frames.current));
      },
    );
  }

  const current = PHASES.find((p) => p.name === stage);
  const busy = stage === "neutral" || stage === "smile";

  return (
    <TestShell
      letter="F"
      title="Face"
      description="We compare how each side of the mouth moves from a relaxed face to a smile. One side moving less can be a sign of facial weakness."
      instructions={[
        "Hold the phone at eye level, about an arm's length away.",
        "Make sure the face is well lit and looking straight at the camera.",
        "When asked, smile widely and show the teeth.",
      ]}
    >
      <CameraStage videoRef={videoRef} canvasRef={canvasRef} status={status} error={error} onRetry={retry}>
        <div className="absolute inset-x-0 top-0 p-3">
          <TrackingBadge modelState={modelState} hint={hint} />
        </div>
        {busy && current && (
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
            <p className="text-center text-xl font-semibold sm:text-2xl" aria-live="assertive">
              {current.show}
            </p>
            <PhaseTimer ms={current.ms} phaseKey={current.name} />
          </div>
        )}
      </CameraStage>

      <div className="mt-4 flex justify-center">
        {stage === "ready" && (
          <button
            type="button"
            onClick={start}
            disabled={modelState !== "ready" || status !== "ready" || hint === "searching"}
            className="rounded-full bg-rose-600 px-8 py-3 text-lg font-semibold text-white shadow transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {modelState === "loading" ? "Loading face model…" : hint === "searching" ? "Waiting for a face…" : "Start face check"}
          </button>
        )}
        {modelState === "error" && (
          <p className="text-red-600" role="alert">
            The face model could not load. Check your connection and reload the page.
          </p>
        )}
      </div>
    </TestShell>
  );
}

function TrackingBadge({ modelState, hint }: { modelState: string; hint: Hint }) {
  const [text, cls] =
    modelState !== "ready"
      ? ["Loading model…", "bg-slate-700/80"]
      : hint === "good"
        ? ["Face tracked", "bg-emerald-600/90"]
        : hint === "turned"
          ? ["Face the camera directly", "bg-amber-500/90"]
          : ["Looking for a face…", "bg-slate-700/80"];
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium text-white ${cls}`} role="status">
      {text}
    </span>
  );
}
