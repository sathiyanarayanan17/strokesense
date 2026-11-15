"""Quick diagnostic: how well does each single feature separate the groups?"""
import csv
import re
from pathlib import Path

import numpy as np
from sklearn.metrics import roc_auc_score

from features import CHANNEL_NAMES, ROBUST_NAMES
from paths import FEATURES_CSV, TORGO

rows = [r for r in csv.DictReader(FEATURES_CSV.open(encoding="utf-8"))
        if r["mic"] == "wav_arrayMic" and r["prompt_type"] in ("word", "sentence")]
y = np.array([int(r["label"]) for r in rows])
spk = np.array([r["speaker"] for r in rows])

prompts = {}
for r in rows:
    txt = (TORGO / Path(r["file"]).parent.parent / "prompts" / (Path(r["file"]).stem + ".txt"))
    prompts[r["file"]] = len(re.findall(r"[A-Za-z']+", txt.read_text(encoding="utf-8", errors="ignore")))

names = list(ROBUST_NAMES) + CHANNEL_NAMES
X = {n: np.array([float(r[n]) for r in rows]) for n in names}
X["duration_sec"] = np.array([float(r["duration_sec"]) for r in rows])
X["sec_per_word"] = X["duration_sec"] / np.array([max(1, prompts[r["file"]]) for r in rows])

for subset in ("sentence", "word"):
    m = np.array([r["prompt_type"] == subset for r in rows])
    scores = []
    for n, v in X.items():
        a = roc_auc_score(y[m], v[m])
        # speaker-level: mean feature per speaker
        sp = sorted(set(spk[m]))
        sv = np.array([v[m][spk[m] == s].mean() for s in sp])
        sy = np.array([y[m][spk[m] == s][0] for s in sp])
        scores.append((max(a, 1 - a), a, roc_auc_score(sy, sv), n))
    scores.sort(reverse=True)
    print(f"--- {subset}s (n={m.sum()}) top features: |utterance AUC|, speaker-level AUC")
    for s, a, sa, n in scores[:12]:
        print(f"  {n:<20} utt {a:.3f}  spk {sa:.3f}")
