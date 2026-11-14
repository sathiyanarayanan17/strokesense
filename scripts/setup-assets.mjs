// Copies the MediaPipe WASM runtime and downloads the on-device models into
// /public, so the app serves everything itself (offline-capable, no CDN at runtime).
// Runs automatically on `npm install` (postinstall), including on Vercel.
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDst = join(root, "public", "mediapipe", "wasm");
const modelDir = join(root, "public", "models");

const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

async function copyWasm() {
  if (!existsSync(wasmSrc)) throw new Error(`MediaPipe WASM not found at ${wasmSrc}`);
  await mkdir(wasmDst, { recursive: true });
  for (const f of await readdir(wasmSrc)) await copyFile(join(wasmSrc, f), join(wasmDst, f));
  console.log("[assets] MediaPipe WASM copied");
}

async function downloadModels() {
  await mkdir(modelDir, { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const dst = join(modelDir, name);
    if (existsSync(dst) && (await stat(dst)).size > 0) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
    await writeFile(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`[assets] downloaded ${name}`);
  }
}

await copyWasm();
await downloadModels();
