"use client";

import type { Vec2 } from "@/lib/math";

/** Resizes the overlay canvas to the video's native resolution and clears it. */
export function prepareCanvas(canvas: HTMLCanvasElement | null, video: HTMLVideoElement) {
  if (!canvas) return null;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

export function drawPoints(ctx: CanvasRenderingContext2D, pts: Vec2[], color: string, r = 2) {
  ctx.fillStyle = color;
  for (const p of pts) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSegments(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  pairs: Array<[number, number]>,
  color: string,
  width = 4,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  for (const [a, b] of pairs) {
    if (!pts[a] || !pts[b]) continue;
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  }
}

/** MediaPipe returns normalised [0,1] coordinates; convert to video pixels. */
export function toPixels<T extends { x: number; y: number }>(lm: T[], video: HTMLVideoElement) {
  return lm.map((p) => ({ ...p, x: p.x * video.videoWidth, y: p.y * video.videoHeight }));
}
