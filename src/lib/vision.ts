"use client";

import type { FaceLandmarker, FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

/**
 * Lazily loads MediaPipe models, served from /public so the app works offline
 * and no camera frame ever leaves the device. Each model is created once and
 * reused across tests. GPU is tried first, falling back to CPU.
 */

const WASM_PATH = "/mediapipe/wasm";
const FACE_MODEL = "/models/face_landmarker.task";
const POSE_MODEL = "/models/pose_landmarker_lite.task";

// WasmFileset is not exported by the package, so derive it from the resolver.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let filesetPromise: Promise<WasmFileset> | null = null;
let facePromise: Promise<FaceLandmarker> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;

async function fileset() {
  if (!filesetPromise) {
    filesetPromise = import("@mediapipe/tasks-vision").then((m) => m.FilesetResolver.forVisionTasks(WASM_PATH));
  }
  return filesetPromise;
}

async function withGpuFallback<T>(create: (delegate: "GPU" | "CPU") => Promise<T>): Promise<T> {
  try {
    return await create("GPU");
  } catch (err) {
    console.warn("GPU delegate unavailable, falling back to CPU", err);
    return create("CPU");
  }
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = (async () => {
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const fs = await fileset();
      return withGpuFallback((delegate) =>
        FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
        }),
      );
    })().catch((e) => {
      facePromise = null; // allow retry
      throw e;
    });
  }
  return facePromise;
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!posePromise) {
    posePromise = (async () => {
      const { PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const fs = await fileset();
      return withGpuFallback((delegate) =>
        PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      );
    })().catch((e) => {
      posePromise = null;
      throw e;
    });
  }
  return posePromise;
}
