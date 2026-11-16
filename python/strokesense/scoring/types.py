"""Shared result types (port of src/lib/scoring/types.ts)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

TestId = Literal["balance", "eyes", "face", "arm", "speech"]
Finding = Literal["normal", "borderline", "abnormal", "inconclusive"]
Side = Literal["left", "right"]

SEVERITY: dict[str, int] = {"inconclusive": 0, "normal": 1, "borderline": 2, "abnormal": 3}


@dataclass
class Quality:
    valid_samples: int = 0
    total_samples: int = 0
    notes: list[str] = field(default_factory=list)


@dataclass
class TestResult:
    """
    finding:
      normal       – no sign detected
      borderline   – weak / uncertain sign; treat with caution
      abnormal     – clear sign consistent with stroke
      inconclusive – not enough good-quality data to judge
    weaker_side is always the PERSON's own side, never the mirrored screen side.
    """

    test: TestId
    finding: Finding
    score: float
    summary: str
    metrics: dict[str, float] = field(default_factory=dict)
    quality: Quality = field(default_factory=Quality)
    weaker_side: Side | None = None

    __test__ = False  # not a pytest test class


def worse(a: Finding, b: Finding) -> Finding:
    return a if SEVERITY[a] >= SEVERITY[b] else b


def inconclusive(test: TestId, summary: str, notes: list[str] | None = None) -> TestResult:
    return TestResult(test, "inconclusive", 0.0, summary, {}, Quality(0, 0, list(notes or [])))
