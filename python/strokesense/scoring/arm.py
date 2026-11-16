"""Arm drift analysis, the "A" in BE-FAST (port of src/lib/scoring/arm.ts).

Camera version of the pronator-drift test: wrist height relative to the shoulder line, in
shoulder-width units (positive = above the shoulder), over a ~10 s hold.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from ..mathutil import HasXY, clamp, dist, median, rnd, round_int, slope
from .types import Finding, Quality, Side, TestResult

POSE_LANDMARKS = {"left_shoulder": 11, "right_shoulder": 12, "left_wrist": 15, "right_wrist": 16}

ARM_THRESHOLDS = {
    "min_visibility": 0.5,
    "min_frames": 20,
    "min_duration_ms": 5000,
    "window_ms": 1500,
    "raise_fail_height": -0.6,
    "drift_borderline": 0.12,
    "drift_abnormal": 0.22,
}


@dataclass
class ArmFrame:
    t: float  # ms since the hold phase started
    points: Sequence[HasXY]  # pose landmarks in pixel coordinates (may carry .visibility)


@dataclass
class ArmSample:
    t: float
    left: float
    right: float


def arm_heights(points: Sequence[HasXY], min_visibility: float = ARM_THRESHOLDS["min_visibility"]):
    P = POSE_LANDMARKS
    idx = [P["left_shoulder"], P["right_shoulder"], P["left_wrist"], P["right_wrist"]]
    if any(i >= len(points) or points[i] is None for i in idx):
        return None
    ls, rs, lw, rw = (points[i] for i in idx)
    if any(getattr(p, "visibility", 1.0) < min_visibility for p in (ls, rs, lw, rw)):
        return None
    width = dist(ls, rs)
    if width < 1e-6:
        return None
    # Image y grows downward, so shoulder.y - wrist.y is positive when the wrist is higher.
    return (ls.y - lw.y) / width, (rs.y - rw.y) / width


def score_arms(frames: Sequence[ArmFrame]) -> TestResult:
    T = ARM_THRESHOLDS
    notes: list[str] = []
    samples: list[ArmSample] = []
    for f in frames:
        h = arm_heights(f.points)
        if h:
            samples.append(ArmSample(f.t, h[0], h[1]))

    quality = Quality(len(samples), len(frames), notes)
    duration = samples[-1].t - samples[0].t if samples else 0.0

    if len(samples) < T["min_frames"] or duration < T["min_duration_ms"]:
        notes.append("Shoulders and wrists were not clearly visible for long enough.")
        return TestResult(
            "arm",
            "inconclusive",
            0.0,
            "We could not track both arms. Step back so the head, shoulders and hands are all in view, then retry.",
            {"validFrames": len(samples), "durationMs": round_int(duration)},
            quality,
        )

    t0, t_end = samples[0].t, samples[-1].t
    start = [s for s in samples if s.t - t0 <= T["window_ms"]]
    end = [s for s in samples if t_end - s.t <= T["window_ms"]]

    start_l, start_r = median([s.left for s in start]), median([s.right for s in start])
    end_l, end_r = median([s.left for s in end]), median([s.right for s in end])

    drift_l, drift_r = start_l - end_l, start_r - end_r  # positive = arm sank
    ts = [(s.t - t0) / 1000 for s in samples]
    slope_l = slope(ts, [s.left for s in samples])
    slope_r = slope(ts, [s.right for s in samples])

    fail_l = start_l < T["raise_fail_height"]
    fail_r = start_r < T["raise_fail_height"]
    drift_diff = abs(drift_l - drift_r)

    metrics: dict[str, float] = {
        "startHeightLeft": rnd(start_l),
        "startHeightRight": rnd(start_r),
        "driftLeft": rnd(drift_l),
        "driftRight": rnd(drift_r),
        "slopeLeftPerSec": rnd(slope_l),
        "slopeRightPerSec": rnd(slope_r),
        "durationMs": round_int(duration),
    }

    weaker: Side | None = None
    finding: Finding
    if fail_l != fail_r:
        weaker = "left" if fail_l else "right"
        finding = "abnormal"
        summary = f"The {weaker} arm could not be raised to shoulder height."
    elif fail_l and fail_r:
        finding = "inconclusive"
        notes.append("Neither arm reached shoulder height.")
        summary = "Neither arm was raised to shoulder height. Retry, or answer the bystander question."
    else:
        weaker = "left" if drift_l > drift_r else "right"
        worst = max(drift_l, drift_r)
        if drift_diff >= T["drift_abnormal"] and worst >= T["drift_abnormal"]:
            finding = "abnormal"
        elif drift_diff >= T["drift_borderline"] and worst >= T["drift_borderline"]:
            finding = "borderline"
        else:
            finding = "normal"
        if finding == "normal" and drift_l >= T["drift_abnormal"] and drift_r >= T["drift_abnormal"]:
            notes.append("Both arms lowered together, which is more typical of tiredness than one-sided weakness.")
        summary = (
            "Both arms stayed level."
            if finding == "normal"
            else f"The {weaker} arm drifted down while the other stayed up."
        )

    score = 1.0 if finding == "abnormal" and (fail_l or fail_r) else clamp(drift_diff / 0.4)
    return TestResult(
        "arm",
        finding,
        score,
        summary,
        metrics,
        quality,
        None if finding in ("normal", "inconclusive") else weaker,
    )
