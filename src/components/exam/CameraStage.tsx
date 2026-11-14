"use client";

import type { ReactNode, RefObject } from "react";
import type { CameraStatus } from "./camera";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  status: CameraStatus;
  error: string | null;
  /** Overlay content (instructions, countdown) shown on top of the video. */
  children?: ReactNode;
}

/** Mirrored selfie view with a landmark overlay. Video and canvas are mirrored together so they stay aligned. */
export function CameraStage({ videoRef, canvasRef, status, error, children }: Props) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900 shadow-lg sm:aspect-video">
      <div className="absolute inset-0 -scale-x-100">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted aria-label="Live camera view" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" aria-hidden />
      </div>

      {status === "starting" && (
        <div className="absolute inset-0 grid place-items-center text-slate-200" role="status">
          Starting camera…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-red-200" role="alert">
          {error}
        </div>
      )}
      {status === "ready" && children}
    </div>
  );
}

/** Progress bar that drains over `ms`. Re-keyed per phase so the CSS animation restarts. */
export function PhaseTimer({ ms, phaseKey }: { ms: number; phaseKey: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/25" aria-hidden>
      <div key={phaseKey} className="animate-drain h-full rounded-full bg-white" style={{ animationDuration: `${ms}ms` }} />
    </div>
  );
}
