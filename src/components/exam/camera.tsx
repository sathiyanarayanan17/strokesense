"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type CameraStatus = "starting" | "ready" | "error";

// Errors that often clear up by themselves, e.g. the OS has not released the camera yet.
const TRANSIENT = new Set(["NotReadableError", "AbortError", "TrackStartError"]);
const RETRY_DELAYS_MS = [300, 700, 1500];

async function openCamera(isCancelled: () => boolean): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot access the camera. Use a recent Chrome, Edge or Safari over HTTPS.");
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (!TRANSIENT.has(name) || attempt >= RETRY_DELAYS_MS.length || isCancelled()) throw e;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError") return "Camera permission was denied. Allow camera access in the browser's address bar, then retry.";
  if (name === "NotFoundError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it, then retry.";
  return e instanceof Error ? e.message : "Could not start the camera.";
}

interface CameraState {
  stream: MediaStream | null;
  status: CameraStatus;
  error: string | null;
  retry: () => void;
}

const CameraContext = createContext<CameraState | null>(null);

/**
 * Owns ONE camera stream shared by all camera checks while `active` is true.
 * Opening the camera once avoids a second permission prompt, a black flash
 * between steps and slow re-acquisition on some phones. The stream is always
 * stopped when the camera steps end or the component unmounts.
 */
export function CameraProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("starting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setError(null);
    setStatus("starting");
    setAttempt((a) => a + 1);
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let opened: MediaStream | null = null;

    openCamera(() => cancelled)
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        opened = s;
        setStream(s);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(describeError(e));
        setStatus("error");
      });

    return () => {
      cancelled = true;
      opened?.getTracks().forEach((t) => t.stop());
      setStream(null);
      setStatus("starting");
    };
  }, [active, attempt]);

  return <CameraContext value={{ stream, status, error, retry }}>{children}</CameraContext>;
}

/** Attaches the shared camera stream to this component's <video> element. */
export function useCamera() {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error("useCamera must be used inside <CameraProvider>");
  const { stream, status: streamStatus, error: streamError, retry } = ctx;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState<MediaStream | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;
    let cancelled = false;
    video.srcObject = stream;
    video
      .play()
      .then(() => {
        if (!cancelled) {
          setPlayError(null);
          setPlaying(stream);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setPlayError(describeError(e));
      });
    return () => {
      cancelled = true;
      video.pause();
      video.srcObject = null; // detach only; the provider owns and stops the stream
    };
  }, [stream]);

  const status: CameraStatus =
    streamStatus === "error" || playError ? "error" : streamStatus === "ready" && playing === stream ? "ready" : "starting";
  return { videoRef, status, error: streamError ?? playError, retry };
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
