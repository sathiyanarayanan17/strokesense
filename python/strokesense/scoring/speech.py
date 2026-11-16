"""Speech analysis, the "S" in BE-FAST (port of src/lib/scoring/speech.ts).

Combines word error rate, on-device pause analysis, an optional trained speech model and the
bystander's own judgement ("yes, it sounded wrong" always counts).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal, Sequence

from ..mathutil import clamp, rnd, round_int
from .types import Finding, Quality, TestResult, worse

TARGET_SENTENCE = "You can't teach an old dog new tricks"

SPEECH_THRESHOLDS = {
    "min_voiced_ms": 400,
    "wer_borderline": 0.15,
    "wer_abnormal": 0.4,
    "pause_min_ms": 300,
    "merge_gap_ms": 150,
    "pause_ratio_borderline": 0.45,
    "min_rms": 0.01,
    "noise_multiplier": 3,
}

BystanderAnswer = Literal["yes", "no", "unsure"]


@dataclass
class EnergySample:
    t: float  # ms
    rms: float  # 0..1


def normalize_words(text: str) -> list[str]:
    text = text.lower().replace("\u2019", "").replace("'", "")  # can't -> cant
    return re.sub(r"[^a-z0-9\s]", " ", text).split()


def word_edit_distance(a: Sequence[str], b: Sequence[str]) -> int:
    """Word-level Levenshtein distance."""
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        diag = prev[0]
        prev[0] = i
        for j in range(1, len(b) + 1):
            tmp = prev[j]
            prev[j] = min(prev[j] + 1, prev[j - 1] + 1, diag + (0 if a[i - 1] == b[j - 1] else 1))
            diag = tmp
    return prev[len(b)]


def word_error_rate(target: str, transcript: str) -> float:
    ref = normalize_words(target)
    if not ref:
        return 0.0
    return word_edit_distance(ref, normalize_words(transcript)) / len(ref)


@dataclass
class VoiceActivity:
    voiced_ms: float
    span_ms: float
    pause_count: int
    longest_pause_ms: float
    pause_ratio: float


def detect_voice_activity(samples: Sequence[EnergySample], noise_floor: float) -> VoiceActivity:
    """Simple energy-based voice activity detection."""
    S = SPEECH_THRESHOLDS
    threshold = max(S["min_rms"], noise_floor * S["noise_multiplier"])
    segments: list[list[float]] = []
    for s in samples:
        if s.rms < threshold:
            continue
        if segments and s.t - segments[-1][1] <= S["merge_gap_ms"]:
            segments[-1][1] = s.t
        else:
            segments.append([s.t, s.t])

    if not segments:
        return VoiceActivity(0, 0, 0, 0, 0)

    voiced = 0.0
    pauses = 0
    longest = 0.0
    silent_inside = 0.0
    for i, seg in enumerate(segments):
        voiced += seg[1] - seg[0]
        if i > 0:
            gap = seg[0] - segments[i - 1][1]
            silent_inside += gap
            if gap >= S["pause_min_ms"]:
                pauses += 1
                longest = max(longest, gap)
    span = segments[-1][1] - segments[0][0]
    return VoiceActivity(voiced, span, pauses, longest, silent_inside / span if span > 0 else 0.0)


@dataclass
class SpeechInput:
    transcript: str | None  # None = speech recognition unavailable
    energy: Sequence[EnergySample]
    noise_floor: float
    bystander: BystanderAnswer | None = None
    target: str | None = None
    model_probability: float | None = None  # P(dysarthric) from the on-device model
    model_threshold: float | None = None


def score_speech(inp: SpeechInput) -> TestResult:
    S = SPEECH_THRESHOLDS
    target = inp.target if inp.target is not None else TARGET_SENTENCE
    notes: list[str] = []
    va = detect_voice_activity(inp.energy, inp.noise_floor)
    has_transcript = bool(inp.transcript and inp.transcript.strip())
    wer = word_error_rate(target, inp.transcript) if has_transcript else math.nan

    metrics: dict[str, float] = {
        "voicedMs": round_int(va.voiced_ms),
        "pauseCount": va.pause_count,
        "longestPauseMs": round_int(va.longest_pause_ms),
        "pauseRatio": rnd(va.pause_ratio),
    }
    if has_transcript:
        metrics["wordErrorRate"] = rnd(wer)

    machine: Finding = "inconclusive"
    reasons: list[str] = []
    if has_transcript:
        if wer > S["wer_abnormal"]:
            machine = "abnormal"
        elif wer > S["wer_borderline"]:
            machine = "borderline"
        else:
            machine = "normal"
        if machine != "normal":
            reasons.append(f"{round_int(wer * 100)}% of the words did not match the sentence")
    elif va.voiced_ms < S["min_voiced_ms"]:
        notes.append("Little or no speech was picked up by the microphone.")
    elif inp.transcript is None:
        notes.append("Automatic transcription is not available in this browser.")
    else:
        notes.append("Speech was heard but no words could be recognised.")
        machine = "borderline"
        reasons.append("speech was heard but no words could be recognised")

    if va.voiced_ms >= S["min_voiced_ms"] and va.pause_ratio >= S["pause_ratio_borderline"]:
        machine = worse(machine, "borderline")
        reasons.append("there were long pauses inside the sentence")

    # Trained speech model: supporting evidence only. It can raise a "possible sign"
    # but never a warning sign by itself (docs/SPEECH_MODEL.md).
    p = inp.model_probability
    if isinstance(p, (int, float)) and math.isfinite(p):
        metrics["slurProbability"] = rnd(p)
        threshold = inp.model_threshold if inp.model_threshold is not None else 0.5
        if p >= threshold and machine != "inconclusive":
            machine = worse(machine, "borderline")
            reasons.append(f"the speech model detected slurred-speech patterns ({round_int(p * 100)}%)")

    finding: Finding = machine
    if inp.bystander == "yes":
        finding = "abnormal"
        reasons.insert(0, "the bystander reported that the speech sounded slurred or wrong")
    elif inp.bystander == "no" and machine == "inconclusive":
        finding = "normal"

    if finding == "normal":
        summary = "The sentence was repeated clearly."
    elif finding == "inconclusive":
        summary = "We could not assess speech. If the person's speech seems slurred or confused, treat it as a warning sign."
    else:
        summary = f"Possible speech problem: {'; '.join(reasons)}."

    wer_or_zero = 0.0 if math.isnan(wer) else wer
    if finding == "abnormal":
        score = max(0.7, clamp(wer_or_zero))
    else:
        score = clamp(wer) if has_transcript else 0.0

    n = len(inp.energy)
    return TestResult("speech", finding, score, summary, metrics, Quality(n, n, notes))
