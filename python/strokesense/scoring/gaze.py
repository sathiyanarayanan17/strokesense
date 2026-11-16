"""Eye movements, the "E" in BE-FAST (port of src/lib/scoring/gaze.ts).

Iris centre relative to the middle of each eye, along the face's left-right axis, in eye-width units.
Positive = toward the person's LEFT. Landmarks follow MediaPipe Face Mesh with iris refinement.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from ..mathutil import HasXY, clamp, dot, median, normalize, rnd, sub
from .types import Finding, Quality, Side, TestResult

GAZE_LANDMARKS = {
    "right_eye_outer": 33,
    "right_eye_inner": 133,
    "left_eye_inner": 362,
    "left_eye_outer": 263,
    "right_iris": 468,
    "left_iris": 473,
    "nose_tip": 1,
}

GAZE_THRESHOLDS = {
    "max_head_yaw": 0.12,
    "max_head_move": 0.08,
    "min_frames_per_phase": 8,
    "min_excursion": 0.06,
    "palsy_borderline": 0.5,
    "palsy_abnormal": 0.3,
    "deviation_borderline": 0.12,
    "deviation_abnormal": 0.2,
}

GazePhase = Literal["centre", "left", "right"]
_PHASES: tuple[GazePhase, ...] = ("centre", "left", "right")


@dataclass
class GazeFrame:
    phase: GazePhase
    points: Sequence[HasXY]  # face landmarks in pixel coordinates, including iris points


@dataclass
class EyeSample:
    right: float
    left: float
    yaw: float


def eye_offsets(points: Sequence[HasXY]) -> EyeSample | None:
    L = GAZE_LANDMARKS
    if any(i >= len(points) or points[i] is None for i in L.values()):
        return None
    x_axis = normalize(sub(points[L["left_eye_outer"]], points[L["right_eye_outer"]]))
    if x_axis.x == 0 and x_axis.y == 0:
        return None

    def along(p: HasXY) -> float:
        return dot(p, x_axis)

    def eye(inner: int, outer: int, iris: int) -> float | None:
        a, b = along(points[inner]), along(points[outer])
        width = abs(b - a)
        return None if width < 1e-6 else (along(points[iris]) - (a + b) / 2) / width

    right = eye(L["right_eye_inner"], L["right_eye_outer"], L["right_iris"])
    left = eye(L["left_eye_inner"], L["left_eye_outer"], L["left_iris"])
    if right is None or left is None:
        return None
    iod = abs(along(points[L["left_eye_outer"]]) - along(points[L["right_eye_outer"]]))
    mid_eyes = (along(points[L["left_eye_outer"]]) + along(points[L["right_eye_outer"]])) / 2
    return EyeSample(right, left, (along(points[L["nose_tip"]]) - mid_eyes) / iod)


def score_gaze(frames: Sequence[GazeFrame]) -> TestResult:
    T = GAZE_THRESHOLDS
    notes: list[str] = []
    by: dict[str, list[EyeSample]] = {p: [] for p in _PHASES}
    for f in frames:
        s = eye_offsets(f.points)
        if s is not None and abs(s.yaw) <= T["max_head_yaw"]:
            by[f.phase].append(s)
    quality = Quality(sum(len(v) for v in by.values()), len(frames), notes)

    if any(len(by[p]) < T["min_frames_per_phase"] for p in _PHASES):
        notes.append("The eyes were not clearly visible in every part of the test.")
        return TestResult(
            "eyes",
            "inconclusive",
            0.0,
            "We could not track the eyes. Hold the phone closer, in good light, and keep the head facing the screen.",
            {"centreFrames": len(by["centre"]), "leftFrames": len(by["left"]), "rightFrames": len(by["right"])},
            quality,
        )

    def med(p: str, k: str) -> float:
        return median([getattr(s, k) for s in by[p]])

    def both(p: str) -> float:
        return (med(p, "right") + med(p, "left")) / 2

    centre = both("centre")
    to_left = both("left") - centre
    to_right = centre - both("right")
    head_move = max(abs(med("left", "yaw") - med("centre", "yaw")), abs(med("right", "yaw") - med("centre", "yaw")))

    metrics: dict[str, float] = {
        "restingGaze": rnd(centre),
        "excursionLeft": rnd(to_left),
        "excursionRight": rnd(to_right),
        "headMovement": rnd(head_move),
    }

    if head_move > T["max_head_move"]:
        notes.append("The head turned to follow the dot instead of only the eyes.")
        return TestResult(
            "eyes",
            "inconclusive",
            0.0,
            "The head moved during the test. Hold the head still (a bystander can gently steady it) "
            "and follow the dot with the eyes only.",
            metrics,
            quality,
        )
    if max(to_left, to_right) < T["min_excursion"]:
        notes.append("Little or no eye movement was detected in either direction.")
        return TestResult(
            "eyes",
            "inconclusive",
            0.0,
            "We did not see the eyes follow the dot. Retry closer to the camera.",
            metrics,
            quality,
        )

    weaker: Side = "left" if to_left < to_right else "right"
    ratio = max(0.0, min(to_left, to_right)) / max(to_left, to_right)
    abs_dev = abs(centre)
    dev_side: Side = "left" if centre > 0 else "right"
    reasons: list[str] = []
    finding: Finding = "normal"

    def raise_(f: Finding, why: str) -> None:
        nonlocal finding
        if f == "abnormal" or finding == "normal":
            finding = f
        reasons.append(why)

    if ratio < T["palsy_abnormal"]:
        raise_("abnormal", f"the eyes could not look properly to the {weaker}")
    elif ratio < T["palsy_borderline"]:
        raise_("borderline", f"the eyes moved less to the {weaker}")
    if abs_dev >= T["deviation_abnormal"]:
        raise_("abnormal", f"at rest the eyes were pulled to the {dev_side}")
    elif abs_dev >= T["deviation_borderline"]:
        raise_("borderline", f"at rest the eyes pointed slightly to the {dev_side}")
    metrics["excursionRatio"] = rnd(ratio)

    if finding == "normal":
        side = None
        summary = "Both eyes followed the dot evenly to each side."
    else:
        side = weaker if ratio < T["palsy_borderline"] else dev_side
        summary = f"Possible eye-movement problem: {'; '.join(reasons)}."
    return TestResult("eyes", finding, clamp(max(1 - ratio, abs_dev / 0.3)), summary, metrics, quality, side)
