"""Facial droop analysis, the "F" in BE-FAST (port of src/lib/scoring/face.ts).

Each frame is converted to a face-aligned frame (origin = mid outer-eye, x = right eye -> left eye,
y = forehead -> chin orthogonalised, unit = inter-ocular distance). Frames with a turned head are
rejected. Excursion asymmetry of the mouth corners from rest to smile is the main signal.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

from ..mathutil import (
    HasXY,
    Point,
    clamp,
    dist,
    dot,
    median,
    normalize,
    percentile,
    rnd,
    round_int,
    sub,
)
from .types import Finding, Quality, Side, TestResult

FACE_LANDMARKS = {
    "right_eye_outer": 33,
    "left_eye_outer": 263,
    "mouth_right": 61,
    "mouth_left": 291,
    "nose_tip": 1,
    "forehead": 10,
    "chin": 152,
}

# Provisional thresholds. Calibrate against a labelled dataset before any clinical use.
FACE_THRESHOLDS = {
    "max_yaw": 0.12,
    "min_frames_per_phase": 8,
    "min_excursion": 0.05,
    "eai_borderline": 0.2,
    "eai_abnormal": 0.35,
    "droop_borderline": 0.06,
    "droop_abnormal": 0.1,
}

FacePhase = Literal["neutral", "smile"]


@dataclass
class FaceFrame:
    phase: FacePhase
    points: Sequence[HasXY]  # landmarks in pixel coordinates


@dataclass
class LocalCorners:
    right: Point
    left: Point
    yaw: float


def to_local_corners(points: Sequence[HasXY]) -> LocalCorners | None:
    L = FACE_LANDMARKS
    if any(i >= len(points) or points[i] is None for i in L.values()):
        return None
    r_eye, l_eye = points[L["right_eye_outer"]], points[L["left_eye_outer"]]
    scale = dist(r_eye, l_eye)
    if scale < 1e-6:
        return None

    origin = Point((r_eye.x + l_eye.x) / 2, (r_eye.y + l_eye.y) / 2)
    x_axis = normalize(sub(l_eye, r_eye))
    vertical = sub(points[L["chin"]], points[L["forehead"]])
    d = dot(vertical, x_axis)
    y_axis = normalize(Point(vertical.x - d * x_axis.x, vertical.y - d * x_axis.y))
    if y_axis.x == 0 and y_axis.y == 0:
        return None

    def local(p: HasXY) -> Point:
        v = sub(p, origin)
        return Point(dot(v, x_axis) / scale, dot(v, y_axis) / scale)

    return LocalCorners(
        right=local(points[L["mouth_right"]]),
        left=local(points[L["mouth_left"]]),
        yaw=local(points[L["nose_tip"]]).x,
    )


def score_face(frames: Sequence[FaceFrame]) -> TestResult:
    T = FACE_THRESHOLDS
    notes: list[str] = []
    neutral: list[LocalCorners] = []
    smile: list[LocalCorners] = []
    turned = 0

    for f in frames:
        c = to_local_corners(f.points)
        if c is None:
            continue
        if abs(c.yaw) > T["max_yaw"]:
            turned += 1
            continue
        (neutral if f.phase == "neutral" else smile).append(c)

    quality = Quality(len(neutral) + len(smile), len(frames), notes)
    if turned > len(frames) * 0.3:
        notes.append("Head was often turned away from the camera.")

    if len(neutral) < T["min_frames_per_phase"] or len(smile) < T["min_frames_per_phase"]:
        notes.append("Not enough clear, front-facing frames of the face.")
        return TestResult(
            "face",
            "inconclusive",
            0.0,
            "We could not see the face clearly enough. Retry facing the camera in good light.",
            {"neutralFrames": len(neutral), "smileFrames": len(smile)},
            quality,
        )

    rest_r = Point(median([c.right.x for c in neutral]), median([c.right.y for c in neutral]))
    rest_l = Point(median([c.left.x for c in neutral]), median([c.left.y for c in neutral]))

    exc_r = percentile([dist(c.right, rest_r) for c in smile], 90)
    exc_l = percentile([dist(c.left, rest_l) for c in smile], 90)
    max_exc = max(exc_r, exc_l)

    # Positive droop => the person's left corner sits lower during the smile.
    droop = median([c.left.y - c.right.y for c in smile]) - median([c.left.y - c.right.y for c in neutral])

    metrics: dict[str, float] = {
        "excursionLeft": rnd(exc_l),
        "excursionRight": rnd(exc_r),
        "excursionAsymmetry": 0.0,
        "smileDroop": rnd(droop),
        "neutralFrames": len(neutral),
        "smileFrames": len(smile),
    }

    if max_exc < T["min_excursion"]:
        notes.append("No smile movement detected.")
        return TestResult(
            "face",
            "inconclusive",
            0.0,
            "We did not detect a smile. Ask the person to smile widely and show their teeth, then retry.",
            metrics,
            quality,
        )

    eai = abs(exc_l - exc_r) / max_exc
    metrics["excursionAsymmetry"] = rnd(eai)
    abs_droop = abs(droop)

    if abs(exc_l - exc_r) > 1e-3:
        weaker: Side = "left" if exc_l < exc_r else "right"
    else:
        weaker = "left" if droop > 0 else "right"

    finding: Finding = "normal"
    if eai >= T["eai_abnormal"] or abs_droop >= T["droop_abnormal"]:
        finding = "abnormal"
    elif eai >= T["eai_borderline"] or abs_droop >= T["droop_borderline"]:
        finding = "borderline"

    pct = round_int(eai * 100)
    if finding == "normal":
        summary = f"Both sides of the mouth moved evenly (difference {pct}%)."
    else:
        lower = " and sat lower during the smile" if abs_droop >= T["droop_borderline"] else ""
        summary = f"The {weaker} side of the mouth moved {pct}% less than the other side{lower}."

    return TestResult(
        "face",
        finding,
        clamp(max(eai / 0.6, abs_droop / 0.2)),
        summary,
        metrics,
        quality,
        None if finding == "normal" else weaker,
    )
