"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

export type CameraStatus = "starting" | "ready" | "error";

/** Opens the front camera for the lifetime of the component and always releases it on unmount. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;

    const request = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      : Promise.reject(new Error("This browser cannot access the camera. Use a recent Chrome, Edge or Safari over HTTPS."));

    request
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        await video.play();
        if (!cancelled) setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the browser's address bar, then retry."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : e instanceof Error
                ? e.message
                : "Could not start the camera.",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, status, error };
}

/**
 * Calls `onFrame` once per new video frame while `running` is true.
 * `now` is a monotonically increasing timestamp, as MediaPipe VIDEO mode requires.
 */
export function useFrameLoop(
  videoRef: RefObject<HTMLVideoElement | null>,
  running: boolean,
  onFrame: (video: HTMLVideoElement, now: number) => void,
) {
  const handle = useEffectEvent(onFrame);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastVideoTime = -1;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        try {
          handle(v, performance.now());
        } catch (err) {
          console.error("Frame processing failed", err);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, videoRef]);
}

/** Runs a timed sequence of phases (e.g. "relax" -> "smile"). Returns a cancel function. */
export function runPhases<P extends string>(
  phases: Array<{ name: P; ms: number }>,
  onPhase: (name: P, ms: number) => void,
  onDone: () => void,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let elapsed = 0;
  phases.forEach((p) => {
    timers.push(setTimeout(() => onPhase(p.name, p.ms), elapsed));
    elapsed += p.ms;
  });
  timers.push(setTimeout(onDone, elapsed));
  return () => timers.forEach(clearTimeout);
}
