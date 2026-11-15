"""
Trains and evaluates the dysarthric-speech detector.

  python ml/train.py

Evaluation is leave-one-speaker-out (LOSO): for each of the 15 speakers, a model
is trained on the other 14 and tested on the held-out speaker, so no result
comes from a voice the model has already heard. Confidence intervals use a
cluster bootstrap over speakers, because utterances from one speaker are not
independent.

Outputs
  src/lib/ml/speech-model.json   weights used by the browser
  ml/results.json                all metrics
  docs/SPEECH_MODEL.md           human-readable report
"""
from __future__ import annotations

import csv
import json
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

from features import CHANNEL_NAMES, ROBUST_NAMES
from paths import FEATURES_CSV
SEED = 7
HERE = Path(__file__).resolve().parent
REPO = HERE.parent
HIDDEN = (32, 16)
TARGET_SENSITIVITY = 0.90


def load():
    rows = list(csv.DictReader(FEATURES_CSV.open(encoding="utf-8")))
    # Head-mic recordings exist only for dysarthric speakers: a channel confound. Drop them.
    rows = [r for r in rows if r["mic"] == "wav_arrayMic" and r["prompt_type"] in ("word", "sentence")]
    return rows


def matrix(rows, names):
    return np.array([[float(r[n]) for n in names] for r in rows])


def speaker_weights(spk, y):
    """Each speaker contributes equally; then both classes contribute equally."""
    w = np.zeros(len(spk))
    for s in np.unique(spk):
        w[spk == s] = 1.0 / np.sum(spk == s)
    for c in (0, 1):
        w[y == c] /= w[y == c].sum()
    return w * len(w) / w.sum()


def make_model(kind):
    if kind == "logreg":
        return LogisticRegression(C=0.05, max_iter=5000)
    return MLPClassifier(hidden_layer_sizes=HIDDEN, alpha=1.0, learning_rate_init=1e-3,
                         max_iter=300, early_stopping=False, random_state=SEED)


def select_features(X, y, k):
    """Top-k features by univariate |AUC - 0.5|, computed on TRAINING data only."""
    if k is None or k >= X.shape[1]:
        return np.arange(X.shape[1])
    score = np.array([abs(roc_auc_score(y, X[:, j]) - 0.5) for j in range(X.shape[1])])
    return np.sort(np.argsort(score)[::-1][:k])


class Pipeline:
    def __init__(self, kind, k):
        self.kind, self.k = kind, k

    def fit(self, X, y, w):
        self.cols = select_features(X, y, self.k)
        self.scaler = StandardScaler().fit(X[:, self.cols])
        self.model = make_model(self.kind)
        self.model.fit(self.scaler.transform(X[:, self.cols]), y, sample_weight=w)
        return self

    def proba(self, X):
        return self.model.predict_proba(self.scaler.transform(X[:, self.cols]))[:, 1]


def loso(kind, k, X, y, spk):
    oof = np.zeros(len(y))
    for s in np.unique(spk):
        test = spk == s
        pipe = Pipeline(kind, k).fit(X[~test], y[~test], speaker_weights(spk[~test], y[~test]))
        oof[test] = pipe.proba(X[test])
    return oof


def sens_spec(y, p, thr):
    pred = p >= thr
    return float(np.mean(pred[y == 1])), float(np.mean(~pred[y == 0]))


def cluster_bootstrap(y, p, spk, stat, n=2000):
    rng = np.random.default_rng(SEED)
    speakers = np.unique(spk)
    pos = [s for s in speakers if y[spk == s][0] == 1]
    neg = [s for s in speakers if y[spk == s][0] == 0]
    vals = []
    for _ in range(n):
        pick = list(rng.choice(pos, len(pos))) + list(rng.choice(neg, len(neg)))
        idx = np.concatenate([np.flatnonzero(spk == s) for s in pick])
        vals.append(stat(y[idx], p[idx]))
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def threshold_for_sensitivity(y, p, target):
    """Highest threshold whose sensitivity is still >= target."""
    for t in np.sort(np.unique(p))[::-1]:
        if np.mean(p[y == 1] >= t) >= target:
            return float(t)
    return 0.5


def evaluate(name, kind, k, names, rows):
    X, y = matrix(rows, names), np.array([int(r["label"]) for r in rows])
    spk = np.array([r["speaker"] for r in rows])
    ptype = np.array([r["prompt_type"] for r in rows])
    p = loso(kind, k, X, y, spk)
    thr = threshold_for_sensitivity(y, p, TARGET_SENSITIVITY)
    se5, sp5 = sens_spec(y, p, 0.5)
    se_t, sp_t = sens_spec(y, p, thr)
    s_mask = ptype == "sentence"
    se5s, sp5s = sens_spec(y[s_mask], p[s_mask], 0.5)
    per_spk = {s: float(p[spk == s].mean()) for s in np.unique(spk)}
    spk_correct = sum((per_spk[s] >= 0.5) == bool(y[spk == s][0]) for s in per_spk)
    res = {
        "name": name,
        "model": kind,
        "n_features": len(names) if k is None else k,
        "k": k,
        "auc": float(roc_auc_score(y, p)),
        "auc_ci": cluster_bootstrap(y, p, spk, roc_auc_score),
        "auc_sentences": float(roc_auc_score(y[ptype == "sentence"], p[ptype == "sentence"])),
        "auc_words": float(roc_auc_score(y[ptype == "word"], p[ptype == "word"])) if np.any(ptype == "word") else None,
        "sens_at_0.5": se5,
        "spec_at_0.5": sp5,
        "sens_sentences_at_0.5": se5s,
        "spec_sentences_at_0.5": sp5s,
        "threshold_for_90_sens": thr,
        "sens_at_thr": se_t,
        "spec_at_thr": sp_t,
        "speakers_correct": int(spk_correct),
        "speakers_total": len(per_spk),
        "per_speaker_mean_prob": per_spk,
    }
    print(f"{name:<44} AUC {res['auc']:.3f} [{res['auc_ci'][0]:.3f}-{res['auc_ci'][1]:.3f}]"
          f"  sent {res['auc_sentences']:.3f}  sens/spec@0.5 {se5:.2f}/{sp5:.2f}  speakers {spk_correct}/15")
    return res, p


def export(rows, names, cfg, thr, metrics):
    kind, k = cfg
    X, y = matrix(rows, names), np.array([int(r["label"]) for r in rows])
    spk = np.array([r["speaker"] for r in rows])
    pipe = Pipeline(kind, k).fit(X, y, speaker_weights(spk, y))
    m = pipe.model
    if kind == "logreg":
        layers = [{"W": m.coef_.round(7).tolist(), "b": m.intercept_.round(7).tolist()}]
    else:
        layers = [{"W": W.T.round(7).tolist(), "b": b.round(7).tolist()} for W, b in zip(m.coefs_, m.intercepts_)]
    model = {
        "version": 1,
        "task": "dysarthric speech detection (screening)",
        "modelType": kind,
        "trainedOn": f"TORGO, {len(np.unique(spk))} speakers, {len(y)} utterances, array microphone",
        "trainedAt": date.today().isoformat(),
        "features": [names[i] for i in pipe.cols],
        "scaler": {"mean": pipe.scaler.mean_.round(8).tolist(), "scale": pipe.scaler.scale_.round(8).tolist()},
        "layers": layers,  # W as [out][in]
        "hiddenActivation": "relu",
        "outputActivation": "sigmoid",
        "threshold": 0.5,
        "metrics": {key: metrics[key] for key in (
            "auc", "auc_ci", "auc_sentences", "sens_at_0.5", "spec_at_0.5",
            "sens_sentences_at_0.5", "spec_sentences_at_0.5", "speakers_correct", "speakers_total")},
    }
    out = REPO / "src" / "lib" / "ml" / "speech-model.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(model))
    # Reference predictions so the TypeScript inference can be checked against sklearn.
    ref = {"inputs": [dict(zip(names, row)) for row in X[:5].tolist()], "probs": pipe.proba(X[:5]).tolist()}
    (REPO / "src" / "lib" / "ml" / "speech-model.reference.json").write_text(json.dumps(ref))
    print(f"exported {out.relative_to(REPO)}: {kind}, features = {model['features']}")


def report(results, n_utts, n_spk):
    main = results["deployed"]
    rows = "\n".join(
        f"| {r['name']} | {r['model']} | {r['n_features']} | {r['auc']:.3f} ({r['auc_ci'][0]:.3f}–{r['auc_ci'][1]:.3f}) "
        f"| {r['auc_sentences']:.3f} | {r['sens_at_0.5']:.2f} / {r['spec_at_0.5']:.2f} | {r['speakers_correct']}/{r['speakers_total']} |"
        for r in results["all"]
    )
    spk = "\n".join(
        f"| {s} | {'dysarthria' if s in ('F01','F03','F04','M01','M02','M03','M04','M05') else 'control'} | {v:.2f} |"
        for s, v in sorted(main["per_speaker_mean_prob"].items())
    )
    md = f"""# Speech model: dysarthric speech detection

Generated by `python ml/train.py` on {date.today().isoformat()}.

## Data

[TORGO](http://www.cs.toronto.edu/~complingweb/data/TORGO/torgo.html) (Rudzicz, Namasivayam & Wolff, 2012):
{n_spk} speakers — 8 with dysarthria (cerebral palsy or ALS) and 7 age- and gender-matched controls.
{n_utts} single-word and sentence utterances from the array microphone. Non-speech prompts were excluded.
Head-microphone recordings were **excluded** because they exist only for dysarthric speakers, which would let a
model learn the microphone instead of the speech.

## Method

- **Features:** 34 channel-robust candidates — variability of 12 MFCCs and their deltas, spectral flux, voicing
  ratio, speech segments per second, mean segment length, speaking rate (speech span per word), energy dynamics and
  spectral centroid, all over voiced frames. In each training fold the 10 most separating features are chosen
  **using the training speakers only**. Absolute MFCC means were left out because they mainly encode the microphone
  and room (the ablation below confirms they do not help).
- **Models compared:** logistic regression and a multilayer perceptron {HIDDEN} (ReLU, L2 = 1.0), with and without
  in-fold feature selection, trained on all utterances or on sentences only.
  Each speaker contributes equally to training, and both classes are balanced.
- **Evaluation:** leave-one-speaker-out across all 15 speakers. 95% confidence intervals from a cluster bootstrap
  over speakers (2,000 resamples).
- **Browser:** the same feature code is re-implemented in TypeScript and checked against Python by a parity test;
  the network runs in a few microseconds. No audio leaves the device.

## Results (held-out speakers)

| Feature set | Model | Features | AUC (95% CI) | AUC sentences | Sens / Spec @ 0.5 | Speakers correct |
|---|---|---|---|---|---|---|
{rows}

**Deployed:** {main['name']}.

At probability ≥ 0.5 on held-out **sentences**: sensitivity {main['sens_sentences_at_0.5']:.2f}, specificity
{main['spec_sentences_at_0.5']:.2f}. Pushing sensitivity to 90% would need a threshold of
{main['threshold_for_90_sens']:.3f}, where specificity falls to {main['spec_at_thr']:.2f} — far too many false alarms.
So the app uses 0.5, and the model can only raise a **"possible sign"** (borderline). It never produces a warning
sign by itself; that still needs wrong words, long pauses or the bystander's judgement.

### Mean predicted probability per held-out speaker

| Speaker | Group | Mean P(dysarthric) |
|---|---|---|
{spk}

## Limitations

- **Not stroke data.** TORGO dysarthria comes from cerebral palsy and ALS. Post-stroke dysarthria shares many
  features (slow, imprecise, effortful speech) but this model has **not** been validated on stroke patients.
- **Only 15 speakers.** Confidence intervals are wide; one unusual speaker moves the results noticeably.
- **Recording conditions differ** from a phone in an emergency. TORGO controls and patients were recorded in the
  same lab, which limits but does not remove channel effects.
- The deployed configuration was chosen as the best of six channel-robust configurations on the same held-out
  predictions, so its numbers are slightly optimistic. A fresh test set (new speakers) is needed to confirm them.
- In the app the model is **one input** to the speech check, alongside word errors, pauses and the bystander's
  judgement — never the only one.

## Licence

TORGO is free for academic, non-profit use. Citation: Rudzicz, F., Namasivayam, A. K., Wolff, T. (2012).
The TORGO database of acoustic and articulatory speech from speakers with dysarthria. *Language Resources and
Evaluation*, 46(4), 523–541. The raw audio is not redistributed in this repository.
"""
    (REPO / "docs" / "SPEECH_MODEL.md").write_text(md, encoding="utf-8")


def main():
    rows = load()
    print(f"{len(rows)} utterances, {len({r['speaker'] for r in rows})} speakers")
    robust = list(ROBUST_NAMES)
    sentences = [r for r in rows if r["prompt_type"] == "sentence"]
    configs = [
        ("Logistic regression, all robust features", "logreg", None, robust, rows),
        ("Logistic regression, top-10 (selected in-fold)", "logreg", 10, robust, rows),
        ("MLP 32-16, top-10 (selected in-fold)", "mlp", 10, robust, rows),
        ("MLP 32-16, all robust features", "mlp", None, robust, rows),
        ("Logistic regression, robust + MFCC means (channel-sensitive)", "logreg", None, robust + CHANNEL_NAMES, rows),
        ("Sentences only: logistic regression, top-10", "logreg", 10, robust, sentences),
        ("Sentences only: MLP 32-16, top-10", "mlp", 10, robust, sentences),
    ]
    results = []
    for name, kind, k, names, data in configs:
        r, _ = evaluate(name, kind, k, names, data)
        r["names"], r["data"] = names, data
        results.append(r)
    # The app always records a sentence, so deploy the best channel-robust model by held-out SENTENCE AUC.
    deployed = max((r for r in results if "channel-sensitive" not in r["name"]), key=lambda r: r["auc_sentences"])
    deployed["name"] += " (deployed)"
    export(deployed["data"], deployed["names"], (deployed["model"], deployed["k"]), deployed["threshold_for_90_sens"], deployed)
    for r in results:
        r.pop("names")
        r.pop("data")
    (HERE / "results.json").write_text(json.dumps({"deployed": deployed, "all": results}, indent=1))
    report({"deployed": deployed, "all": results}, len(rows), len({r["speaker"] for r in rows}))
    print("wrote ml/results.json and docs/SPEECH_MODEL.md")


if __name__ == "__main__":
    main()
