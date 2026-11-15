"""
Acoustic features for dysarthric (slurred) speech detection.

EVERY step here is mirrored exactly in src/lib/ml/features.ts so the browser
computes the same numbers the model was trained on. A parity test
(src/lib/ml/features.test.ts) checks this against a fixture produced by
`python ml/features.py --fixture`. Change both files together.

Pipeline (16 kHz mono float audio in [-1, 1]):
  pre-emphasis -> 25 ms Hann frames, 10 ms hop -> 512-pt power spectrum
  -> 40 HTK-mel bands (60-7600 Hz) -> log -> DCT-II (orthonormal) -> MFCC 1..12
  energy-based voice activity -> utterance-level statistics over voiced frames.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

SR = 16000
FRAME = 400
HOP = 160
NFFT = 512
NMELS = 40
NMFCC = 12
FMIN, FMAX = 60.0, 7600.0
PREEMPH = 0.97
VAD_DB_BELOW_MAX = 35.0
VAD_ABS_FLOOR = -9.0  # natural-log frame energy; ≈ 55 dB below a full-scale tone
EPS = 1e-10

ROBUST_NAMES = (
    [f"mfcc{i}_std" for i in range(1, NMFCC + 1)]
    + [f"dmfcc{i}_std" for i in range(1, NMFCC + 1)]
    + ["flux_mean", "flux_std", "voiced_ratio", "segments_per_sec", "mean_segment_sec",
       "energy_std", "denergy_std", "centroid_mean", "centroid_std", "span_sec_per_word"]
)
CHANNEL_NAMES = [f"mfcc{i}_mean" for i in range(1, NMFCC + 1)]


def hz_to_mel(f):
    return 2595.0 * np.log10(1.0 + np.asarray(f, dtype=np.float64) / 700.0)


def mel_to_hz(m):
    return 700.0 * (10.0 ** (np.asarray(m, dtype=np.float64) / 2595.0) - 1.0)


def mel_filterbank() -> np.ndarray:
    """(NMELS, NFFT//2+1) triangular filters on linear bin frequencies, peak 1."""
    bins = np.arange(NFFT // 2 + 1) * SR / NFFT
    edges = mel_to_hz(np.linspace(hz_to_mel(FMIN), hz_to_mel(FMAX), NMELS + 2))
    fb = np.zeros((NMELS, bins.size))
    for m in range(NMELS):
        lo, mid, hi = edges[m], edges[m + 1], edges[m + 2]
        up = (bins - lo) / (mid - lo)
        down = (hi - bins) / (hi - mid)
        fb[m] = np.maximum(0.0, np.minimum(up, down))
    return fb


def dct_matrix() -> np.ndarray:
    """Orthonormal DCT-II rows k = 0..NMELS-1."""
    n = np.arange(NMELS)
    k = np.arange(NMELS)[:, None]
    d = np.sqrt(2.0 / NMELS) * np.cos(np.pi * k * (2 * n + 1) / (2 * NMELS))
    d[0] /= np.sqrt(2.0)
    return d


FB = mel_filterbank()
DCT = dct_matrix()
WINDOW = 0.5 - 0.5 * np.cos(2 * np.pi * np.arange(FRAME) / (FRAME - 1))  # symmetric Hann
BIN_HZ = np.arange(NFFT // 2 + 1) * SR / NFFT


def deltas(x: np.ndarray) -> np.ndarray:
    """Regression deltas, N=2, edge-padded. x: (T, D)."""
    p = np.pad(x, ((2, 2), (0, 0)), mode="edge")
    return (2 * (p[4:] - p[:-4]) + (p[3:-1] - p[1:-3])) / 10.0


def frame_signal(y: np.ndarray) -> np.ndarray:
    y = np.concatenate([[y[0]], y[1:] - PREEMPH * y[:-1]]) if y.size else y
    if y.size < FRAME:
        y = np.pad(y, (0, FRAME - y.size))
    n = 1 + (y.size - FRAME) // HOP
    idx = np.arange(FRAME)[None, :] + HOP * np.arange(n)[:, None]
    return y[idx] * WINDOW


def frame_features(y: np.ndarray):
    frames = frame_signal(np.asarray(y, dtype=np.float64))
    power = np.abs(np.fft.rfft(frames, n=NFFT)) ** 2 / NFFT
    logmel = np.log(power @ FB.T + EPS)
    mfcc = logmel @ DCT.T
    energy = np.log(power.sum(axis=1) + EPS)
    centroid = (power * BIN_HZ).sum(axis=1) / (power.sum(axis=1) + EPS) / (SR / 2)
    return logmel, mfcc[:, 1 : NMFCC + 1], energy, centroid


def voiced_mask(energy: np.ndarray) -> np.ndarray:
    thr = max(energy.max() - VAD_DB_BELOW_MAX / (10 / np.log(10)), VAD_ABS_FLOOR)
    return energy > thr


def segments(mask: np.ndarray, merge_gap: int = 15):
    """Runs of voiced frames, merging gaps shorter than merge_gap frames (150 ms)."""
    segs = []
    for i in np.flatnonzero(mask):
        if segs and i - segs[-1][1] <= merge_gap:
            segs[-1][1] = i
        else:
            segs.append([i, i])
    return segs


def utterance_features(y: np.ndarray, n_words: int = 1) -> dict[str, float] | None:
    """Returns None if there is too little speech (< 20 voiced frames).
    `n_words` is the number of words in the prompt (8 for the app's sentence)."""
    logmel, mfcc, energy, centroid = frame_features(y)
    mask = voiced_mask(energy)
    if mask.sum() < 20:
        return None
    dm = deltas(mfcc)
    de = deltas(energy[:, None])[:, 0]
    flux = np.sqrt(np.mean(np.diff(logmel, axis=0) ** 2, axis=1))
    flux = np.concatenate([[0.0], flux])
    segs = segments(mask)
    span = (segs[-1][1] - segs[0][0] + 1) * HOP / SR
    seg_secs = [(b - a + 1) * HOP / SR for a, b in segs]

    v = mask
    feats = {}
    for i in range(NMFCC):
        feats[f"mfcc{i + 1}_std"] = float(mfcc[v, i].std())
    for i in range(NMFCC):
        feats[f"dmfcc{i + 1}_std"] = float(dm[v, i].std())
    feats["flux_mean"] = float(flux[v].mean())
    feats["flux_std"] = float(flux[v].std())
    feats["voiced_ratio"] = float(v.sum() * HOP / SR / span)
    feats["segments_per_sec"] = float(len(segs) / span)
    feats["mean_segment_sec"] = float(np.mean(seg_secs))
    feats["energy_std"] = float(energy[v].std())
    feats["denergy_std"] = float(de[v].std())
    feats["centroid_mean"] = float(centroid[v].mean())
    feats["centroid_std"] = float(centroid[v].std())
    # Speaking rate: seconds from first to last speech per word in the prompt.
    feats["span_sec_per_word"] = float(span / max(1, n_words))
    for i in range(NMFCC):
        feats[f"mfcc{i + 1}_mean"] = float(mfcc[v, i].mean())
    return feats


def fixture_signal() -> np.ndarray:
    """Deterministic test signal reproduced exactly in the TypeScript test."""
    n = np.arange(int(1.6 * SR))
    t = n / SR
    tone = 0.4 * np.sin(2 * np.pi * 180 * t) * (0.6 + 0.4 * np.sin(2 * np.pi * 4 * t))
    tone += 0.15 * np.sin(2 * np.pi * (900 + 400 * t) * t)
    gate = ((t > 0.2) & (t < 0.7)) | ((t > 0.95) & (t < 1.4))
    return np.where(gate, tone, 0.0005 * np.sin(2 * np.pi * 50 * t))


if __name__ == "__main__" and "--fixture" in sys.argv:
    out = Path(__file__).resolve().parents[1] / "src" / "lib" / "ml" / "features.fixture.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(utterance_features(fixture_signal(), n_words=3), indent=1))
    print("wrote", out)
