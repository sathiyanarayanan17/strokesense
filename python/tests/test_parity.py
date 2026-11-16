"""Checks the Python port against outputs produced by the TypeScript engine.

The fixture is written by src/lib/scoring/parity.test.ts (`npm run parity:update`).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from strokesense.mathutil import Point
from strokesense.scoring.arm import ArmFrame, score_arms
from strokesense.scoring.balance import BalanceFrame, score_balance
from strokesense.scoring.face import FaceFrame, score_face
from strokesense.scoring.gaze import GazeFrame, score_gaze
from strokesense.scoring.speech import EnergySample, SpeechInput, score_speech

CASES = json.loads((Path(__file__).parent / "parity.fixture.json").read_text(encoding="utf-8"))


def points(sparse: dict) -> list:
    out: list = [None] * (max(int(k) for k in sparse) + 1)
    for k, v in sparse.items():
        out[int(k)] = Point(v[0], v[1], v[2] if len(v) > 2 else 1.0)
    return out


def run(case: dict):
    kind, raw = case["kind"], case["input"]
    if kind == "face":
        return score_face([FaceFrame(f["phase"], points(f["points"])) for f in raw])
    if kind == "arm":
        return score_arms([ArmFrame(f["t"], points(f["points"])) for f in raw])
    if kind == "balance":
        return score_balance([BalanceFrame(f["t"], points(f["points"])) for f in raw])
    if kind == "gaze":
        return score_gaze([GazeFrame(f["phase"], points(f["points"])) for f in raw])
    return score_speech(
        SpeechInput(
            transcript=raw["transcript"],
            energy=[EnergySample(e["t"], e["rms"]) for e in raw["energy"]],
            noise_floor=raw["noiseFloor"],
            bystander=raw.get("bystander"),
            model_probability=raw.get("modelProbability"),
        )
    )


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_matches_typescript(case):
    got, exp = run(case), case["expected"]
    assert got.finding == exp["finding"]
    assert got.weaker_side == exp["weakerSide"]
    assert got.summary == exp["summary"]
    assert got.quality.notes == exp["notes"]
    assert got.score == pytest.approx(exp["score"], abs=1e-9)
    assert sorted(got.metrics) == sorted(exp["metrics"])
    for k, v in exp["metrics"].items():
        assert got.metrics[k] == pytest.approx(v, abs=1e-9), k
