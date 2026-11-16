"""Balance and Eyes answers reported by the bystander (port of src/lib/scoring/reported.ts)."""
from __future__ import annotations

from typing import Literal

from .types import SEVERITY, Finding, Quality, TestResult

ReportedAnswer = Literal["yes", "no", "unsure"]
ReportedTest = Literal["balance", "eyes"]

_SUMMARIES: dict[str, dict[str, str]] = {
    "balance": {
        "yes": "Sudden loss of balance, dizziness or trouble walking was reported.",
        "no": "No sudden balance problem was reported.",
        "unsure": "It is not known whether there was a sudden balance problem.",
    },
    "eyes": {
        "yes": "Sudden vision loss, blurred or double vision was reported.",
        "no": "No sudden vision problem was reported.",
        "unsure": "It is not known whether there was a sudden vision problem.",
    },
}


def score_reported(test: ReportedTest, answer: ReportedAnswer) -> TestResult:
    finding: Finding = "abnormal" if answer == "yes" else "normal" if answer == "no" else "inconclusive"
    return TestResult(
        test,
        finding,
        1.0 if answer == "yes" else 0.0,
        _SUMMARIES[test][answer],
        {},
        Quality(1, 1, ["Reported by the person or bystander."]),
    )


def merge_results(a: TestResult, b: TestResult) -> TestResult:
    """Combine two results for the same item. The more severe finding wins; inconclusive never hides the other."""
    if a.test != b.test:
        raise ValueError(f"cannot merge {a.test} with {b.test}")
    hi, lo = (a, b) if SEVERITY[a.finding] >= SEVERITY[b.finding] else (b, a)
    notes = list(dict.fromkeys([*hi.quality.notes, *lo.quality.notes]))
    return TestResult(
        a.test,
        hi.finding,
        max(a.score, b.score),
        f"{hi.summary} {lo.summary}"[:300],
        {**lo.metrics, **hi.metrics},
        Quality(
            a.quality.valid_samples + b.quality.valid_samples,
            a.quality.total_samples + b.quality.total_samples,
            notes,
        ),
        hi.weaker_side or lo.weaker_side,
    )
