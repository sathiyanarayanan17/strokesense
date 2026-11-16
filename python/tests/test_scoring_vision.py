"""Ports of the vitest suites for face, arm, balance and gaze scoring."""
from __future__ import annotations

import math
import random

from strokesense.mathutil import Point
from strokesense.scoring.arm import POSE_LANDMARKS as P
from strokesense.scoring.arm import ArmFrame, score_arms
from strokesense.scoring.balance import BALANCE_LANDMARKS as B
from strokesense.scoring.balance import BalanceFrame, could_not_stand, score_balance
from strokesense.scoring.face import FACE_LANDMARKS as F
from strokesense.scoring.face import FaceFrame, score_face
from strokesense.scoring.gaze import GAZE_LANDMARKS as G
from strokesense.scoring.gaze import GazeFrame, score_gaze


# ---------------------------------------------------------------- face
def make_face(smile_right=0.0, smile_left=0.0, yaw_px=0.0, roll_deg=0.0, jitter=0.0, rng=None):
    rng = rng or random.Random(1)
    pts = [Point(500, 400) for _ in range(478)]

    def j() -> float:
        return (rng.random() - 0.5) * jitter

    pts[F["right_eye_outer"]] = Point(400, 300)
    pts[F["left_eye_outer"]] = Point(600, 300)
    pts[F["forehead"]] = Point(500, 200)
    pts[F["chin"]] = Point(500, 600)
    pts[F["nose_tip"]] = Point(500 + yaw_px, 400)
    pts[F["mouth_right"]] = Point(440 - 24 * smile_right + j(), 500 - 24 * smile_right + j())
    pts[F["mouth_left"]] = Point(560 + 24 * smile_left + j(), 500 - 24 * smile_left + j())
    if roll_deg:
        a = math.radians(roll_deg)
        c, s = math.cos(a), math.sin(a)
        return [Point(500 + (p.x - 500) * c - (p.y - 400) * s, 400 + (p.x - 500) * s + (p.y - 400) * c) for p in pts]
    return pts


def face_session(smile: dict, extra: dict | None = None, n: int = 20):
    extra = extra or {}
    return [FaceFrame("neutral", make_face(**extra)) for _ in range(n)] + [
        FaceFrame("smile", make_face(**{**extra, **smile})) for _ in range(n)
    ]


def test_face_even_smile_is_normal():
    r = score_face(face_session({"smile_left": 1, "smile_right": 1}, {"jitter": 1}))
    assert r.finding == "normal"
    assert r.metrics["excursionAsymmetry"] < 0.15


def test_face_droop_names_persons_weaker_side():
    r = score_face(face_session({"smile_left": 0.3, "smile_right": 1}))
    assert r.finding == "abnormal" and r.weaker_side == "left"
    assert score_face(face_session({"smile_left": 1, "smile_right": 0.3})).weaker_side == "right"


def test_face_mild_asymmetry_is_borderline():
    assert score_face(face_session({"smile_left": 0.72, "smile_right": 1})).finding == "borderline"


def test_face_head_tilt_does_not_fool_it():
    r = score_face(face_session({"smile_left": 1, "smile_right": 1}, {"roll_deg": 20}))
    assert r.finding == "normal"


def test_face_turned_head_is_inconclusive():
    r = score_face(face_session({"smile_left": 1, "smile_right": 1}, {"yaw_px": 50}))
    assert r.finding == "inconclusive"


def test_face_no_smile_is_inconclusive():
    assert score_face(face_session({"smile_left": 0, "smile_right": 0})).finding == "inconclusive"


def test_face_too_few_frames_is_inconclusive():
    assert score_face(face_session({"smile_left": 1, "smile_right": 1}, {}, 3)).finding == "inconclusive"


# ---------------------------------------------------------------- arm
def pose(left_h: float, right_h: float, vis: float = 0.9):
    pts = [Point(0, 0, vis) for _ in range(33)]
    pts[P["left_shoulder"]] = Point(600, 300, vis)
    pts[P["right_shoulder"]] = Point(400, 300, vis)
    pts[P["left_wrist"]] = Point(620, 300 - left_h * 200, vis)
    pts[P["right_wrist"]] = Point(380, 300 - right_h * 200, vis)
    return pts


def hold(left, right, vis: float = 0.9):
    n = 300
    out = []
    for i in range(n):
        k = i / (n - 1)
        out.append(ArmFrame(i / 30 * 1000, pose(left[0] + (left[1] - left[0]) * k, right[0] + (right[1] - right[0]) * k, vis)))
    return out


def test_arm_level_is_normal():
    assert score_arms(hold((0, -0.02), (0, -0.01))).finding == "normal"


def test_arm_one_sinking():
    r = score_arms(hold((0, -0.5), (0, -0.02)))
    assert r.finding == "abnormal" and r.weaker_side == "left"
    assert r.metrics["slopeLeftPerSec"] < 0


def test_arm_mild_drift_borderline():
    assert score_arms(hold((0, 0), (0, -0.17))).finding == "borderline"


def test_arm_cannot_raise():
    r = score_arms(hold((0, 0), (-1, -1)))
    assert r.finding == "abnormal" and r.weaker_side == "right"


def test_arm_both_lowering_is_not_one_sided():
    r = score_arms(hold((0, -0.4), (0, -0.4)))
    assert r.finding == "normal"
    assert "tiredness" in " ".join(r.quality.notes)


def test_arm_not_visible_inconclusive():
    assert score_arms(hold((0, 0), (0, 0), 0.2)).finding == "inconclusive"


def test_arm_too_short_inconclusive():
    assert score_arms(hold((0, 0), (0, 0))[:60]).finding == "inconclusive"


# ---------------------------------------------------------------- balance
def stand(sway=lambda t: 0.0, tilt_deg=0.0, step_at_ms=None, vis=0.9, ms=10_000, jitter=0.0):
    rng = random.Random(1)
    rand = lambda: (rng.random() - 0.5) * jitter  # noqa: E731
    frames = []
    t = 0
    while t <= ms:
        dx = sway(t) * 200
        lean = math.tan(math.radians(tilt_deg)) * 200
        pts = [Point(0, 0, vis) for _ in range(33)]

        def p(x, y):
            return Point(x + rand(), y + rand(), vis)

        pts[B["left_shoulder"]] = p(560 + dx + lean, 200)
        pts[B["right_shoulder"]] = p(440 + dx + lean, 200)
        pts[B["left_hip"]] = p(540 + dx, 400)
        pts[B["right_hip"]] = p(460 + dx, 400)
        stepped = step_at_ms is not None and t >= step_at_ms
        pts[B["left_ankle"]] = p(510 + (80 if stepped else 0), 700)
        pts[B["right_ankle"]] = p(490, 700)
        frames.append(BalanceFrame(t, pts))
        t += 33
    return frames


def test_balance_steady_is_normal_with_jitter():
    assert score_balance(stand(sway=lambda t: 0.01 * math.sin(t / 900), jitter=2)).finding == "normal"


def test_balance_large_sway_abnormal():
    assert score_balance(stand(sway=lambda t: 0.12 * math.sin(t / 500))).finding == "abnormal"


def test_balance_moderate_sway_borderline():
    assert score_balance(stand(sway=lambda t: 0.06 * math.sin(t / 1500))).finding == "borderline"


def test_balance_lean_names_side():
    r = score_balance(stand(tilt_deg=14))
    assert r.finding == "abnormal" and r.weaker_side == "left"
    assert score_balance(stand(tilt_deg=-14)).weaker_side == "right"


def test_balance_step_is_abnormal():
    r = score_balance(stand(step_at_ms=5000))
    assert r.finding == "abnormal" and "step" in r.summary


def test_balance_feet_not_visible_inconclusive():
    assert score_balance(stand(vis=0.2)).finding == "inconclusive"


def test_balance_too_short_inconclusive():
    assert score_balance(stand(ms=3000)).finding == "inconclusive"


def test_could_not_stand_is_warning_sign():
    assert could_not_stand().finding == "abnormal"


# ---------------------------------------------------------------- gaze
def gaze_face(right: float, left: float, yaw_px: float = 0.0, roll_deg: float = 0.0):
    pts = [Point(500, 400) for _ in range(478)]
    pts[G["right_eye_outer"]] = Point(380, 300)
    pts[G["right_eye_inner"]] = Point(440, 300)
    pts[G["left_eye_inner"]] = Point(560, 300)
    pts[G["left_eye_outer"]] = Point(620, 300)
    pts[G["right_iris"]] = Point(410 + right * 60, 300)
    pts[G["left_iris"]] = Point(590 + left * 60, 300)
    pts[G["nose_tip"]] = Point(500 + yaw_px, 380)
    if not roll_deg:
        return pts
    a = math.radians(roll_deg)
    return [
        Point(500 + (p.x - 500) * math.cos(a) - (p.y - 400) * math.sin(a),
              400 + (p.x - 500) * math.sin(a) + (p.y - 400) * math.cos(a))
        for p in pts
    ]


def gaze_session(centre=0.0, to_left=0.2, to_right=0.2, yaw_when_looking=0.0, roll_deg=0.0, n=15):
    frames = []

    def add(phase, g, yaw):
        frames.extend(GazeFrame(phase, gaze_face(g, g, yaw, roll_deg)) for _ in range(n))

    add("centre", centre, 0)
    add("left", centre + to_left, yaw_when_looking)
    add("right", centre - to_right, -yaw_when_looking)
    return frames


def test_gaze_even_is_normal():
    assert score_gaze(gaze_session()).finding == "normal"


def test_gaze_head_tilt_not_fooled():
    assert score_gaze(gaze_session(roll_deg=15)).finding == "normal"


def test_gaze_palsy_names_side():
    r = score_gaze(gaze_session(to_left=0.03, to_right=0.22))
    assert r.finding == "abnormal" and r.weaker_side == "left"


def test_gaze_reduced_one_side_borderline():
    assert score_gaze(gaze_session(to_left=0.2, to_right=0.08)).finding == "borderline"


def test_gaze_resting_deviation():
    r = score_gaze(gaze_session(centre=-0.25))
    assert r.finding == "abnormal" and "pulled to the right" in r.summary


def test_gaze_head_turn_inconclusive():
    assert score_gaze(gaze_session(yaw_when_looking=25)).finding == "inconclusive"


def test_gaze_no_movement_inconclusive():
    assert score_gaze(gaze_session(to_left=0, to_right=0)).finding == "inconclusive"


def test_gaze_too_few_frames_inconclusive():
    assert score_gaze(gaze_session(n=3)).finding == "inconclusive"
