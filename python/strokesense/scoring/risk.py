"""Combines the individual tests into one recommendation (port of src/lib/scoring/risk.ts).

A deterministic rule engine: any single positive sign is enough to call emergency services.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Sequence

from .types import Finding, TestId, TestResult

RiskTier = Literal["emergency", "possible", "inconclusive", "no-signs"]


@dataclass
class RiskAssessment:
    tier: RiskTier
    headline: str
    advice: str
    positive_tests: list[TestId] = field(default_factory=list)
    borderline_tests: list[TestId] = field(default_factory=list)
    inconclusive_tests: list[TestId] = field(default_factory=list)


def assess_risk(results: Sequence[TestResult]) -> RiskAssessment:
    def by(f: Finding) -> list[TestId]:
        return [r.test for r in results if r.finding == f]

    positive, borderline, inconclusive = by("abnormal"), by("borderline"), by("inconclusive")

    if positive:
        tier: RiskTier = "emergency"
        headline = "Warning signs of stroke detected"
        advice = 'Call emergency services now. Say "suspected stroke" and give the time the person was last seen well.'
    elif borderline:
        tier = "possible"
        headline = "Possible warning signs"
        advice = "Do not wait to see if it gets better. Call emergency services and mention a possible stroke."
    elif inconclusive or not results:
        tier = "inconclusive"
        headline = "Some checks could not be completed"
        advice = (
            "If you notice ANY sudden face drooping, arm weakness, speech trouble, vision loss or loss of "
            "balance, call emergency services immediately."
        )
    else:
        tier = "no-signs"
        headline = "No warning signs detected"
        advice = (
            "This check cannot rule out a stroke. If symptoms appear, return, or you are worried, "
            "call emergency services anyway."
        )
    return RiskAssessment(tier, headline, advice, positive, borderline, inconclusive)


@dataclass
class OnsetInfo:
    hours_since: float
    hours: int
    minutes: int
    window: Literal["early", "day", "late"]  # early: <=4.5 h, day: <=24 h, late: >24 h
    label: str
    message: str


def describe_onset(last_known_well: str | None, now_ms: float) -> OnsetInfo | None:
    """`last_known_well` is an ISO timestamp or None. `now_ms` is epoch milliseconds (keeps this pure)."""
    if not last_known_well:
        return None
    try:
        dt = datetime.fromisoformat(last_known_well.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    hours_since = max(0.0, (now_ms - dt.timestamp() * 1000) / 3_600_000)
    h = math.floor(hours_since)
    m = math.floor((hours_since - h) * 60)
    label = f"{h} h {m} min ago" if h > 0 else f"{m} min ago"
    if hours_since <= 4.5:
        window, message = "early", "Still within the early window when clot-dissolving treatment may be possible. Every minute counts."
    elif hours_since <= 24:
        window, message = "day", "Some treatments may still be possible. Get to hospital without delay."
    else:
        window, message = "late", "Tell the medical team exactly when symptoms began."
    return OnsetInfo(hours_since, h, m, window, label, message)
