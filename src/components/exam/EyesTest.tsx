"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { eyeOffsets, GAZE_LANDMARKS, GAZE_THRESHOLDS, scoreGaze, type GazeFrame, type GazePhase } from "@/lib/scoring/gaze";
import type { TestResult } from "@/lib/scoring/types";
import { getFaceLandmarker } from "@/lib/vision";
import { speak } from "@/lib/voice";
import { runPhases, useCamera, useFrameLoop } from "./camera";
import { CameraStage, PhaseTimer } from "./CameraStage";
import { drawPoints, prepareCanvas, toPixels } from "./draw";
import { TestShell } from "./TestShell";

type Step = GazePhase | "back";
type Stage = "ready" | Step | "done";
type Mode = "dot" | "finger";

const SETTLE_MS = 700; // ignore frames while the eyes are still moving to the target
const PHASES: Array<{ name: Step; ms: number }> = [
  { name: "centre", ms: 2500 },
  { name: "left", ms: 2800 },
  { name: "back", ms: 1500 },
  { name: "right", ms: 2800 },
];

const PROMPTS: Record<Mode, Record<Step, string>> = {
  dot: {
    centre: "Keep your head still. Look at the dot.",
    left: "Follow the dot with your eyes only.",
    back: "Back to the centre.",
    right: "Now follow it the other way.",
  },
  finger: {
    centre: "Hold your finger in front of their face. They look at your finger and keep their head still.",
    left: "Slowly move your finger to their left.",
    back: "Back to the centre.",
    right: "Now move your finger to their right.",
  },
};

export function EyesTest({ onComplete }: { onComplete: (r: TestResult) => void }) {
  const { videoRef, status, error, retry } = useCamera();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarker = useRef<FaceLandmarker | null>(null);
  const frames = useRef<GazeFrame[]>([]);
  const phase = useRef<{ name: Stage; since: number }>({ name: "ready", since: 0 });
  const cancel = useRef<(() => void) | null>(null);
  const lastHintAt = useRef(0);

  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [stage, setStage] = useState<Stage>("ready");
  const [tracked, setTracked] = useState(false);
  // Small screens can't make the eyes move far enough: use a finger instead.
  // (This component only renders on the client, after the user starts the exam.)
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? "finger" : "dot",
  );

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
      cancel.current?.();
    };
  }, []);

  useFrameLoop(videoRef, status === "ready" && modelState === "ready", (video, now) => {
    const res = landmarker.current?.detectForVideo(video, now);
    const ctx = prepareCanvas(canvasRef.current, video);
    const lm = res?.faceLandmarks?.[0];
    let ok = false;
    if (lm && ctx) {
      const pts = toPixels(lm, video);
      const s = eyeOffsets(pts);
      ok = !!s && Math.abs(s.yaw) <= GAZE_THRESHOLDS.maxHeadYaw;
      const G = GAZE_LANDMARKS;
      drawPoints(ctx, [pts[G.leftIris], pts[G.rightIris]], "#f43f5e", video.videoWidth / 220);
      drawPoints(ctx, [pts[G.leftEyeInner], pts[G.leftEyeOuter], pts[G.rightEyeInner], pts[G.rightEyeOuter]], "#facc15", video.videoWidth / 320);
      const p = phase.current;
      if ((p.name === "centre" || p.name === "left" || p.name === "right") && now - p.since >= SETTLE_MS) {
        frames.current.push({ phase: p.name, points: pts });
      }
    }
    if (now - lastHintAt.current > 250) {
      lastHintAt.current = now;
      setTracked(ok);
    }
  });

  function start() {
    frames.current = [];
    cancel.current = runPhases(
      PHASES,
      (name) => {
        phase.current = { name, since: performance.now() };
        setStage(name);
        speak(PROMPTS[mode][name]);
      },
      () => {
        phase.current = { name: "done", since: performance.now() };
        setStage("done");
        onComplete(scoreGaze(frames.current));
      },
    );
  }

  const running = stage !== "ready" && stage !== "done";
  const current = PHASES.find((p) => p.name === stage);
  // Screen left = the person's left (they are facing the screen).
  const dotPos = stage === "left" ? "left-[4%]" : stage === "right" ? "left-[96%]" : "left-1/2";

  return (
    <TestShell
      letter="E"
      title="Eyes"
      description="We track both irises while the eyes follow a target. Eyes pulled to one side, or unable to look one way, can be a sign of stroke."
      instructions={
        mode === "dot"
          ? ["Sit about 50 cm from the screen, face well lit.", "Keep the head still and follow the red dot with the eyes only."]
          : [
              "Hold the phone with one hand, camera facing the person, about 30 cm from their face.",
              "Hold up a finger of your other hand. They follow your finger with their eyes only, head still.",
            ]
      }
    >
      <div className="flex justify-end">
        <div className="inline-flex rounded-full bg-slate-100 p-1 text-sm" role="group" aria-label="Target">
          {(["dot", "finger"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={running}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 font-medium ${mode === m ? "bg-slate-900 text-white" : "text-slate-700"}`}
            >
              {m === "dot" ? "Follow a dot" : "Follow a finger"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <CameraStage videoRef={videoRef} canvasRef={canvasRef} status={status} error={error} onRetry={retry}>
          <div className="absolute inset-x-0 top-0 p-3">
            <span
              className={`inline-block rounded-full px-3 py-1 text-sm font-medium text-white ${
                modelState !== "ready" ? "bg-slate-700/80" : tracked ? "bg-emerald-600/90" : "bg-amber-500/90"
              }`}
              role="status"
            >
              {modelState !== "ready" ? "Loading face model…" : tracked ? "Eyes tracked" : "Face the camera, closer, good light"}
            </span>
          </div>
          {running && mode === "dot" && (
            <div className="pointer-events-none absolute inset-0 bg-slate-950/85" aria-hidden>
              <span
                className={`absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_24px_rgba(244,63,94,0.9)] transition-[left] duration-700 ease-in-out ${dotPos}`}
              />
            </div>
          )}
          {running && current && (
            <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
              <p className="text-center text-lg font-semibold sm:text-xl" aria-live="assertive">
                {PROMPTS[mode][current.name]}
              </p>
              <PhaseTimer ms={current.ms} phaseKey={current.name} />
            </div>
          )}
        </CameraStage>
      </div>

      <div className="mt-4 flex justify-center">
        {stage === "ready" && (
          <button
            type="button"
            onClick={start}
            disabled={modelState !== "ready" || status !== "ready"}
            className="rounded-full bg-rose-600 px-8 py-3 text-lg font-semibold text-white shadow transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {modelState === "loading" ? "Loading face model…" : "Start eye check"}
          </button>
        )}
        {modelState === "error" && (
          <p className="text-red-600" role="alert">
            The face model could not load. Reload the page to retry.
          </p>
        )}
      </div>
    </TestShell>
  );
}
