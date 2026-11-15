/**
 * Acoustic features for the speech model — an exact port of ml/features.py.
 * The parity test (features.test.ts) checks these numbers against Python.
 * Change both files together.
 */

export const SR = 16000;
const FRAME = 400;
const HOP = 160;
const NFFT = 512;
const NBINS = NFFT / 2 + 1;
const NMELS = 40;
const NMFCC = 12;
const FMIN = 60;
const FMAX = 7600;
const PREEMPH = 0.97;
const VAD_DB_BELOW_MAX = 35;
const VAD_ABS_FLOOR = -9;
const EPS = 1e-10;
const MERGE_GAP = 15;

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (10 ** (m / 2595) - 1);

function buildFilterbank(): Float64Array[] {
  const lo = hzToMel(FMIN);
  const hi = hzToMel(FMAX);
  const edges = Array.from({ length: NMELS + 2 }, (_, i) => melToHz(lo + ((hi - lo) * i) / (NMELS + 1)));
  return Array.from({ length: NMELS }, (_, m) => {
    const row = new Float64Array(NBINS);
    const [a, b, c] = [edges[m], edges[m + 1], edges[m + 2]];
    for (let k = 0; k < NBINS; k++) {
      const f = (k * SR) / NFFT;
      row[k] = Math.max(0, Math.min((f - a) / (b - a), (c - f) / (c - b)));
    }
    return row;
  });
}

function buildDct(): Float64Array[] {
  return Array.from({ length: NMELS }, (_, k) => {
    const row = new Float64Array(NMELS);
    const scale = Math.sqrt(2 / NMELS) / (k === 0 ? Math.SQRT2 : 1);
    for (let n = 0; n < NMELS; n++) row[n] = scale * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * NMELS));
    return row;
  });
}

const FB = buildFilterbank();
const DCT = buildDct();
const WINDOW = Float64Array.from({ length: FRAME }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (FRAME - 1)));

// Iterative radix-2 FFT (in place) for NFFT = 512.
const BITREV = (() => {
  const bits = Math.log2(NFFT);
  return Uint16Array.from({ length: NFFT }, (_, i) => {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    return r;
  });
})();

function powerSpectrum(frame: Float64Array, out: Float64Array) {
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  for (let i = 0; i < FRAME; i++) re[BITREV[i]] = frame[i];
  for (let size = 2; size <= NFFT; size *= 2) {
    const half = size / 2;
    const step = (-2 * Math.PI) / size;
    for (let start = 0; start < NFFT; start += size) {
      for (let j = 0; j < half; j++) {
        const wr = Math.cos(step * j);
        const wi = Math.sin(step * j);
        const a = start + j;
        const b = a + half;
        const tr = wr * re[b] - wi * im[b];
        const ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  for (let k = 0; k < NBINS; k++) out[k] = (re[k] * re[k] + im[k] * im[k]) / NFFT;
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};

/** Regression deltas (N = 2), edge-padded — matches numpy `deltas`. */
function deltas(x: number[][]): number[][] {
  const T = x.length;
  const at = (i: number) => x[Math.min(T - 1, Math.max(0, i))];
  return x.map((_, t) => at(t).map((_, d) => (2 * (at(t + 2)[d] - at(t - 2)[d]) + (at(t + 1)[d] - at(t - 1)[d])) / 10));
}

export type SpeechFeatures = Record<string, number>;

/**
 * Utterance-level features from 16 kHz mono audio. Returns null when there is
 * too little speech (< 20 voiced frames). `nWords` = words in the prompt.
 */
export function utteranceFeatures(audio: Float32Array | Float64Array | number[], nWords = 1): SpeechFeatures | null {
  const n = audio.length;
  let y = new Float64Array(Math.max(n, FRAME));
  if (n > 0) {
    y[0] = audio[0];
    for (let i = 1; i < n; i++) y[i] = audio[i] - PREEMPH * audio[i - 1];
  }
  if (n >= FRAME) y = y.subarray(0, n);
  const nFrames = 1 + Math.floor((y.length - FRAME) / HOP);

  const logmel: number[][] = [];
  const mfcc: number[][] = [];
  const energy: number[] = [];
  const centroid: number[] = [];
  const frame = new Float64Array(FRAME);
  const power = new Float64Array(NBINS);
  for (let t = 0; t < nFrames; t++) {
    for (let i = 0; i < FRAME; i++) frame[i] = y[t * HOP + i] * WINDOW[i];
    powerSpectrum(frame, power);
    let total = 0;
    let weighted = 0;
    for (let k = 0; k < NBINS; k++) {
      total += power[k];
      weighted += power[k] * ((k * SR) / NFFT);
    }
    energy.push(Math.log(total + EPS));
    centroid.push(weighted / (total + EPS) / (SR / 2));
    const lm = FB.map((row) => {
      let s = 0;
      for (let k = 0; k < NBINS; k++) s += power[k] * row[k];
      return Math.log(s + EPS);
    });
    logmel.push(lm);
    const c: number[] = [];
    for (let k = 1; k <= NMFCC; k++) {
      let s = 0;
      for (let m = 0; m < NMELS; m++) s += lm[m] * DCT[k][m];
      c.push(s);
    }
    mfcc.push(c);
  }

  const maxE = Math.max(...energy);
  const thr = Math.max(maxE - VAD_DB_BELOW_MAX / (10 / Math.LN10), VAD_ABS_FLOOR);
  const voiced = energy.map((e) => e > thr);
  const idx = voiced.flatMap((v, i) => (v ? [i] : []));
  if (idx.length < 20) return null;

  const dm = deltas(mfcc);
  const de = deltas(energy.map((e) => [e])).map((r) => r[0]);
  const flux = logmel.map((row, t) =>
    t === 0 ? 0 : Math.sqrt(row.reduce((s, v, m) => s + (v - logmel[t - 1][m]) ** 2, 0) / NMELS),
  );

  const segs: Array<[number, number]> = [];
  for (const i of idx) {
    const last = segs[segs.length - 1];
    if (last && i - last[1] <= MERGE_GAP) last[1] = i;
    else segs.push([i, i]);
  }
  const span = ((segs[segs.length - 1][1] - segs[0][0] + 1) * HOP) / SR;
  const segSecs = segs.map(([a, b]) => ((b - a + 1) * HOP) / SR);

  const pick = (a: number[]) => idx.map((i) => a[i]);
  const f: SpeechFeatures = {};
  for (let d = 0; d < NMFCC; d++) f[`mfcc${d + 1}_std`] = std(pick(mfcc.map((r) => r[d])));
  for (let d = 0; d < NMFCC; d++) f[`dmfcc${d + 1}_std`] = std(pick(dm.map((r) => r[d])));
  f.flux_mean = mean(pick(flux));
  f.flux_std = std(pick(flux));
  f.voiced_ratio = (idx.length * HOP) / SR / span;
  f.segments_per_sec = segs.length / span;
  f.mean_segment_sec = mean(segSecs);
  f.energy_std = std(pick(energy));
  f.denergy_std = std(pick(de));
  f.centroid_mean = mean(pick(centroid));
  f.centroid_std = std(pick(centroid));
  f.span_sec_per_word = span / Math.max(1, nWords);
  for (let d = 0; d < NMFCC; d++) f[`mfcc${d + 1}_mean`] = mean(pick(mfcc.map((r) => r[d])));
  return f;
}
