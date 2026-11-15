"""
Builds the feature table from the extracted TORGO corpus.

  python ml/build_dataset.py          -> ml/data/features.csv

One row per utterance (array microphone, falling back to the head microphone
for sessions without array recordings). Non-speech prompts such as
"[say Pah-Tah-Kah repeatedly]" and unreadable files are skipped.
"""
from __future__ import annotations

import csv
import re
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from features import CHANNEL_NAMES, ROBUST_NAMES, SR, utterance_features
from paths import FEATURES_CSV as OUT
from paths import TORGO

DYSARTHRIC = {"F01", "F03", "F04", "M01", "M02", "M03", "M04", "M05"}


def prompt_type(text: str) -> str:
    words = re.findall(r"[A-Za-z']+", text)
    return "word" if len(words) <= 1 else "phrase" if len(words) <= 3 else "sentence"


def jobs():
    for spk_dir in sorted(p for p in TORGO.iterdir() if p.is_dir()):
        spk = spk_dir.name
        for sess in sorted(spk_dir.glob("Session*")):
            mic = "wav_arrayMic" if (sess / "wav_arrayMic").is_dir() else "wav_headMic"
            for wav in sorted((sess / mic).glob("*.wav")):
                txt = sess / "prompts" / (wav.stem + ".txt")
                if not txt.exists():
                    continue
                text = txt.read_text(encoding="utf-8", errors="ignore").strip()
                if not text or text.startswith("[") or "xxx" in text.lower() or ".jpg" in text.lower():
                    continue
                yield str(wav), spk, sess.name, mic, text


def process(job):
    wav, spk, sess, mic, text = job
    try:
        y, sr = sf.read(wav, dtype="float64", always_2d=True)
    except Exception:
        return None
    y = y.mean(axis=1)
    if sr != SR:
        g = np.gcd(int(sr), SR)
        y = resample_poly(y, SR // g, int(sr) // g)
    if y.size < SR * 0.3:
        return None
    f = utterance_features(y, n_words=len(re.findall(r"[A-Za-z']+", text)))
    if f is None or not all(np.isfinite(list(f.values()))):
        return None
    return {
        "speaker": spk,
        "label": int(spk in DYSARTHRIC),
        "session": sess,
        "mic": mic,
        "prompt_type": prompt_type(text),
        "duration_sec": round(y.size / SR, 3),
        "file": str(Path(wav).relative_to(TORGO)),
        **f,
    }


def main():
    todo = list(jobs())
    print(f"{len(todo)} candidate utterances")
    rows = []
    with ProcessPoolExecutor() as ex:
        for i, r in enumerate(ex.map(process, todo, chunksize=32)):
            if r:
                rows.append(r)
            if (i + 1) % 2000 == 0:
                print(f"  {i + 1}/{len(todo)}")
    cols = ["speaker", "label", "session", "mic", "prompt_type", "duration_sec", "file", *ROBUST_NAMES, *CHANNEL_NAMES]
    with OUT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
