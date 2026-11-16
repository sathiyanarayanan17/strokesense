"""Standing balance, the "B" in BE-FAST (port of src/lib/scoring/balance.ts).

Units are torso lengths (mid-shoulder to mid-hip), so the measures do not depend on camera distance.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

from ..mathutil import HasXY, Point, clamp, dist, median, mid, rnd, round_int
from .types import Finding, Quality, Side, TestResult

BALANCE_LANDMARKS = {
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_hip": 23,
    "right_hip": 24,
    "left_ankle": 27,
    "right_ankle": 28,
}

BALANCE_THRESHOLDS = {
    "min_visibility": 0.5,
    "min_frames": 30,
    "min_duration_ms": 6000,
    "sway_smooth_ms": 500,
    "ankle_smooth_ms": 300,
    "rms_borderline": 0.04,
    "rms_abnormal": 0.07,
    "tilt_borderline_deg": 7,
    "tilt_abnormal_deg": 11,
    "step_distance": 0.25,
}


@dataclass
class BalanceFrame:
    t: float  # ms since the hold started
    points: Sequence[HasXY]


@dataclass
class _Sample:
    t: float
    x: float
    tilt_deg: float
    l_ankle: Point
    r_ankle: Point


def _to_sample(f: BalanceFrame, min_vis: float) -> _Sample | None:
    idx = list(BALANCE_LANDMARKS.values())
    if any(i >= len(f.points) or f.points[i] is None for i in idx):
        return None
    pts = [f.points[i] for i in idx]
    if any(getattr(p, "visibility", 1.0) < min_vis for p in pts):
        return None
    ls, rs, lh, rh, la, ra = pts
    sh, hip = mid(ls, rs), mid(lh, rh)
    torso = dist(sh, hip)
    if torso < 1e-6:
        return None
    # Unmirrored camera image: the person's left is +x. Tilt of the hip->shoulder line from vertical.
    tilt = math.degrees(math.atan2(sh.x - hip.x, hip.y - sh.y))
    centre = mid(sh, hip)
    return _Sample(f.t, centre.x / torso, tilt, Point(la.x / torso, la.y / torso), Point(ra.x / torso, ra.y / torso))


def smooth_by_time(values: Sequence[float], times: Sequence[float], window_ms: float) -> list[float]:
    """Centred moving average over a time window, so smoothing is the same at any frame rate."""
    half = window_ms / 2
    lo = hi = 0
    total = 0.0
    n = len(values)
    out: list[float] = []
    for i in range(n):
        while hi < n and times[hi] <= times[i] + half:
            total += values[hi]
            hi += 1
        while times[lo] < times[i] - half:
            total -= values[lo]
            lo += 1
        out.append(total / (hi - lo))
    return out


def score_balance(frames: Sequence[BalanceFrame]) -> TestResult:
    T = BALANCE_THRESHOLDS
    notes: list[str] = []
    samples = [s for s in (_to_sample(f, T["min_visibility"]) for f in frames) if s is not None]
    duration = samples[-1].t - samples[0].t if samples else 0.0
    quality = Quality(len(samples), len(frames), notes)

    if len(samples) < T["min_frames"] or duration < T["min_duration_ms"]:
        notes.append("The whole body, from shoulders to ankles, was not visible for long enough.")
        return TestResult(
            "balance",
            "inconclusive",
            0.0,
            "We could not see the whole body. Place the phone further away so the feet are in view, then retry.",
            {"validFrames": len(samples), "durationMs": round_int(duration)},
            quality,
        )

    ts = [s.t for s in samples]
    xs = smooth_by_time([s.x for s in samples], ts, T["sway_smooth_ms"])
    centre = median(xs)
    rms = math.sqrt(sum((x - centre) ** 2 for x in xs) / len(xs))
    path = sum(abs(xs[i] - xs[i - 1]) for i in range(1, len(xs)))
    velocity = path / (duration / 1000)
    tilt = median([s.tilt_deg for s in samples])

    def sm(side: str, c: str) -> list[float]:
        return smooth_by_time([getattr(getattr(s, side), c) for s in samples], ts, T["ankle_smooth_ms"])

    lx, ly, rx, ry = sm("l_ankle", "x"), sm("l_ankle", "y"), sm("r_ankle", "x"), sm("r_ankle", "y")
    max_step = 0.0
    for i in range(len(samples)):
        max_step = max(max_step, math.hypot(lx[i] - lx[0], ly[i] - ly[0]), math.hypot(rx[i] - rx[0], ry[i] - ry[0]))
    stepped = max_step >= T["step_distance"]

    metrics: dict[str, float] = {
        "swayRms": rnd(rms),
        "swayVelocity": rnd(velocity),
        "trunkTiltDeg": rnd(tilt, 1),
        "maxAnkleMove": rnd(max_step),
        "durationMs": round_int(duration),
    }

    reasons: list[str] = []
    finding: Finding = "normal"

    def raise_(f: Finding, why: str) -> None:
        nonlocal finding
        if f == "abnormal" or finding == "normal":
            finding = f
        reasons.append(why)

    if stepped:
        raise_("abnormal", "they had to step to keep their balance")
    # Sway velocity is reported but not used for decisions: it is dominated by landmark jitter
    # on noisy phone cameras (docs/EVALUATION.md). RMS sway is robust.
    if rms >= T["rms_abnormal"]:
        raise_("abnormal", "they swayed strongly")
    elif rms >= T["rms_borderline"]:
        raise_("borderline", "they swayed more than expected")
    abs_tilt = abs(tilt)
    tilt_side: Side = "left" if tilt > 0 else "right"
    if abs_tilt >= T["tilt_abnormal_deg"]:
        raise_("abnormal", f"their body leaned to the {tilt_side}")
    elif abs_tilt >= T["tilt_borderline_deg"]:
        raise_("borderline", f"their body leaned slightly to the {tilt_side}")

    summary = (
        "They stood steadily without leaning."
        if finding == "normal"
        else f"Possible balance problem: {'; '.join(reasons)}."
    )
    return TestResult(
        "balance",
        finding,
        1.0 if stepped else clamp(max(rms / 0.1, abs_tilt / 15)),
        summary,
        metrics,
        quality,
        tilt_side if abs_tilt >= T["tilt_borderline_deg"] else None,
    )


def could_not_stand() -> TestResult:
    """The person could not stand safely: a warning sign by itself."""
    return TestResult(
        "balance",
        "abnormal",
        1.0,
        "The person could not stand safely without support.",
        {},
        Quality(1, 1, ["Reported by the bystander during the balance check."]),
    )
