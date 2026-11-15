"use client";

import { SR, utteranceFeatures } from "./features";
import { predictSlurred, SPEECH_MODEL } from "./speech-model";

/** Collects raw microphone samples through an AudioWorklet. */
export async function startPcmCapture(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
  await ctx.audioWorklet.addModule("/pcm-recorder.js");
  const node = new AudioWorkletNode(ctx, "pcm-recorder");
  // Some browsers only process nodes connected to the output; route through a muted gain.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute).connect(ctx.destination);

  const chunks: Float32Array[] = [];
  let recording = false;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (recording) chunks.push(e.data);
  };
  return {
    start() {
      chunks.length = 0;
      recording = true;
    },
    stop(): Float32Array {
      recording = false;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Float32Array(total);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.length;
      }
      return out;
    },
    dispose() {
      node.port.onmessage = null;
      node.disconnect();
      mute.disconnect();
    },
  };
}

/** Resamples to 16 kHz with the browser's own resampler. */
export async function resampleTo16k(samples: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === SR || samples.length === 0) return samples;
  const length = Math.ceil((samples.length * SR) / rate);
  const offline = new OfflineAudioContext(1, length, SR);
  const buffer = offline.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Runs the on-device speech model. Returns null if there was too little speech. */
export async function analyseSpeech(samples: Float32Array, rate: number, nWords: number): Promise<number | null> {
  const audio = await resampleTo16k(samples, rate);
  const features = utteranceFeatures(audio, nWords);
  return features ? predictSlurred(features, SPEECH_MODEL) : null;
}
