import modelJson from "./speech-model.json";
import type { SpeechFeatures } from "./features";

/**
 * Dysarthric-speech model trained on TORGO (see ml/train.py, docs/SPEECH_MODEL.md).
 * A tiny feed-forward network evaluated in plain TypeScript: no runtime, no
 * download, and the audio never leaves the device.
 */

export interface SpeechModel {
  features: string[];
  scaler: { mean: number[]; scale: number[] };
  layers: Array<{ W: number[][]; b: number[] }>;
  threshold: number;
  metrics: Record<string, unknown>;
}

export const SPEECH_MODEL = modelJson as unknown as SpeechModel;

const relu = (v: number) => (v > 0 ? v : 0);
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));

/** Probability (0..1) that the utterance is dysarthric, or null if a feature is missing. */
export function predictSlurred(features: SpeechFeatures, model: SpeechModel = SPEECH_MODEL): number | null {
  let x: number[] = [];
  for (let i = 0; i < model.features.length; i++) {
    const v = features[model.features[i]];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    x.push((v - model.scaler.mean[i]) / model.scaler.scale[i]);
  }
  model.layers.forEach((layer, li) => {
    const last = li === model.layers.length - 1;
    x = layer.W.map((row, o) => {
      let s = layer.b[o];
      for (let i = 0; i < row.length; i++) s += row[i] * x[i];
      return last ? s : relu(s);
    });
  });
  return sigmoid(x[0]);
}
