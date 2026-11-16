"""Ports of the vitest suites for speech, reported symptoms and the risk engine."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import pytest

from strokesense.scoring.reported import merge_results, score_reported
from strokesense.scoring.risk import assess_risk, describe_onset
from strokesense.scoring.speech import (
    TARGET_SENTENCE,
    EnergySample,
    SpeechInput,
    detect_voice_activity,
    score_speech,
    word_error_rate,
)
from strokesense.scoring.types import Quality, TestResult


def energy(voiced, total_ms=4000):
    return [
        EnergySample(t, 0.2 if any(a <= t <= b for a, b in voiced) else 0.005)
        for t in range(0, total_ms + 1, 20)
    ]


FLUENT = energy([(500, 2500)])


def speech(**kw):
    kw.setdefault("energy", FLUENT)
    kw.setdefault("noise_floor", 0.005)
    return score_speech(SpeechInput(**kw))


def test_wer_exact_match_ignores_case_and_punctuation():
    assert word_error_rate(TARGET_SENTENCE, "you CAN'T teach an old dog new tricks.") == 0


def test_wer_counts_substitutions_and_deletions():
    assert word_error_rate(TARGET_SENTENCE, "you can teach old dog tricks") == pytest.approx(3 / 8)


def test_voice_activity_finds_pauses():
    va = detect_voice_activity(energy([(500, 1000), (1800, 2300)]), 0.005)
    assert va.pause_count == 1
    assert va.longest_pause_ms >= 780
    assert va.pause_ratio > 0.4


def test_voice_activity_silence():
    assert detect_voice_activity(energy([]), 0.005).voiced_ms == 0


def test_clear_repetition_is_normal():
    assert speech(transcript="you can't teach an old dog new tricks").finding == "normal"


def test_garbled_speech_is_abnormal():
    assert speech(transcript="you teach old sticks").finding == "abnormal"


def test_bystander_yes_always_counts():
    assert speech(transcript=TARGET_SENTENCE, bystander="yes").finding == "abnormal"


def test_no_speech_no_bystander_inconclusive():
    assert speech(transcript="", energy=energy([])).finding == "inconclusive"


def test_bystander_no_without_transcription_is_normal():
    assert speech(transcript=None, bystander="no").finding == "normal"


def test_choppy_speech_is_borderline_even_with_right_words():
    choppy = energy([(200, 500), (1100, 1300), (1900, 2100), (2700, 3000)])
    assert speech(transcript=TARGET_SENTENCE, energy=choppy).finding == "borderline"


def test_model_can_raise_possible_sign_but_not_warning_alone():
    high = speech(transcript=TARGET_SENTENCE, model_probability=0.92)
    assert high.finding == "borderline"
    assert high.metrics["slurProbability"] == 0.92
    assert "speech model" in high.summary
    assert speech(transcript=TARGET_SENTENCE, model_probability=0.2).finding == "normal"


def test_model_cannot_turn_unassessable_recording_into_a_finding():
    r = speech(transcript="", energy=energy([]), model_probability=0.99)
    assert r.finding == "inconclusive"


def test_speech_score_is_finite_when_inconclusive():
    r = speech(transcript="", energy=energy([]))
    assert r.score == 0 and not math.isnan(r.score)


# ---------------------------------------------------------------- reported
def test_reported_answers():
    assert score_reported("balance", "yes").finding == "abnormal"
    assert score_reported("eyes", "no").finding == "normal"
    assert score_reported("eyes", "unsure").finding == "inconclusive"


def test_merge_takes_more_severe_and_keeps_side():
    a = score_reported("balance", "no")
    b = TestResult("balance", "abnormal", 0.8, "Leaned.", {"swayRms": 0.1}, Quality(10, 12, ["x"]), "left")
    m = merge_results(a, b)
    assert m.finding == "abnormal" and m.weaker_side == "left"
    assert m.score == 0.8 and m.quality.total_samples == 13
    with pytest.raises(ValueError):
        merge_results(a, score_reported("eyes", "no"))


def test_merge_inconclusive_does_not_hide_other_part():
    m = merge_results(score_reported("eyes", "unsure"), score_reported("eyes", "yes"))
    assert m.finding == "abnormal"


# ---------------------------------------------------------------- risk
def r(test, finding):
    return TestResult(test, finding, 0.0, "")


def test_any_positive_escalates():
    a = assess_risk([r("face", "normal"), r("arm", "abnormal"), r("speech", "normal")])
    assert a.tier == "emergency" and a.positive_tests == ["arm"]


def test_positive_beats_inconclusive():
    assert assess_risk([r("face", "abnormal"), r("arm", "inconclusive")]).tier == "emergency"


def test_borderline_is_possible():
    assert assess_risk([r("face", "borderline"), r("arm", "normal")]).tier == "possible"


def test_never_all_clear_when_a_test_could_not_complete():
    assert assess_risk([r("face", "normal"), r("arm", "inconclusive")]).tier == "inconclusive"
    assert assess_risk([]).tier == "inconclusive"


def test_no_signs_only_when_all_normal():
    assert assess_risk([r("face", "normal"), r("arm", "normal"), r("speech", "normal")]).tier == "no-signs"


NOW = datetime(2026, 11, 12, 10, 0, tzinfo=timezone.utc).timestamp() * 1000


def test_onset_formats_elapsed_time():
    o = describe_onset("2026-11-12T08:30:00Z", NOW)
    assert o is not None and o.label == "1 h 30 min ago" and "early window" in o.message


def test_onset_unknown_or_invalid():
    assert describe_onset(None, NOW) is None
    assert describe_onset("not a date", NOW) is None
