# StrokeSense — spot a stroke in 60 seconds, with just a phone

[![CI](https://github.com/sathiyanarayanan17/strokesense/actions/workflows/ci.yml/badge.svg)](https://github.com/sathiyanarayanan17/strokesense/actions/workflows/ci.yml)

StrokeSense is a browser app that guides a bystander through the **BE-FAST** stroke check (Balance, Eyes, Face,
Arms, Speech, Time). It uses on-device AI to *measure* the warning signs from the phone's camera and microphone,
tells the family clearly when to call an ambulance, and creates a handoff report the emergency team can scan.

Built for **DSH Hacks V2 — AI × Healthcare**.

## The problem

During a stroke the brain loses about 1.9 million neurons every minute. Clot-dissolving treatment is mainly given
within about 4.5 hours of onset, yet many patients arrive late because the people around them do not recognise the
signs or wait to see if they pass. BE-FAST is easy to describe but hard for a frightened family member to apply.

## What it does

| Step | How it works |
|---|---|
| **T** – Time | Records when the person was last seen well — the fact doctors need most. |
| **B / E** – Balance, Eyes | Two quick questions about sudden balance or vision problems. |
| **F** – Face | MediaPipe Face Landmarker (478 points) runs on the device. We measure how far each mouth corner moves from rest to smile, in a face-aligned coordinate frame, so head tilt and distance don't matter. Frames with a turned head are rejected. |
| **A** – Arms | MediaPipe Pose tracks both wrists against the shoulder line for 10 s with eyes closed — a camera version of the clinical pronator-drift test. Both arms tiring together is *not* counted as one-sided weakness. |
| **S** – Speech | The person repeats the Cincinnati sentence. We combine word error rate, on-device pause analysis and the bystander's own judgement (a "yes, it sounded wrong" always counts). |
| **Result** | A deterministic rule: **any single warning sign → call 108/112 now**. Each finding comes with the measurement behind it. |

After the check:

- **Handoff report + QR code** — a clinician-ready summary. The data is encoded in the link's `#fragment`, which
  browsers never send to a server, so nothing is uploaded or stored. Decoded data is validated as untrusted input.
- **Nearby hospitals** from OpenStreetMap, with distance, call and directions.
- **English, हिन्दी, தமிழ்** explanations for the family, with read-aloud.
- **Works offline** after the first visit (PWA + service worker caching the AI models).

## Design principles

- **Private by design.** Video frames are processed in the browser with WebAssembly; no video or images leave the device.
- **Explainable, not a black box.** Clinical rules make the decision; every result shows its measurement
  (e.g. "the left side of the mouth moved 52% less").
- **Never a false all-clear.** A skipped or failed check makes the result "inconclusive", never "no signs".
- **Tuned to avoid missing a stroke.** A false alarm costs far less than a missed stroke.
- **No generated medical advice.** All family-facing text comes from fixed templates, not an LLM.

## Architecture

```
Browser (Next.js 16 · React 19 · Tailwind 4)
├─ Exam flow (state machine): Time → Balance/Eyes → Face → Arms → Speech → Result
├─ Vision: MediaPipe Tasks (WASM, GPU→CPU fallback), one shared camera stream
│   ├─ Face: face-aligned frame → mouth-corner excursion asymmetry + droop
│   └─ Arms: wrist height vs shoulder line → drift, slope, raise failure
├─ Audio: Web Audio RMS → voice activity & pauses · Web Speech API → transcript → WER
├─ Scoring engine (pure TypeScript, unit-tested) → BE-FAST findings → risk tier
├─ i18n templates (en / hi / ta) · speech synthesis
├─ Report: base64url in URL fragment → QR (qrcode) → /report (validated decode, printable)
└─ Service worker: offline pages + cached models
External (optional): OpenStreetMap Overpass API for hospital search
```

## Run it

Requires Node 20.9+ (tested on Node 24).

```bash
npm install          # also copies the MediaPipe WASM runtime and downloads the models (postinstall)
npm run dev          # http://localhost:3000 — use Chrome or Edge, allow camera & microphone
```

Camera access needs HTTPS or `localhost`. To try it on a phone, deploy (below) or use an HTTPS tunnel.

## Quality checks

```bash
npm test             # 44 unit tests: scoring maths, risk engine, report encoding, hospitals, translations
npm run eval         # synthetic robustness evaluation → docs/EVALUATION.md
npm run build && npm start   # then, in another terminal:
npm run e2e          # end-to-end test in headless Edge with a fake camera (BROWSER=chrome to use Chrome)
npm run lint
```

### Evaluation summary ([full report](docs/EVALUATION.md))

The real scoring engine was fed thousands of simulated exams with known ground truth plus phone-camera noise
(landmark jitter, head tilt, distance, low frame rate, tracking dropouts):

| Test | Condition | Sensitivity | Specificity |
|---|---|---|---|
| Face | Typical phone | 100.0% | 99.3% |
| Face | Hard (3 px jitter, ±20° tilt) | 98.5% | 93.8% |
| Arms | Typical phone | 100.0% | 100.0% |

Mild cases near the thresholds are only partly detected (see severity curves in the report). **This is not clinical
validation**; it shows the measurement pipeline holds up under realistic noise.

## Deploy (Vercel)

1. Push this repository to GitHub.
2. Import it at vercel.com → New Project. Defaults work; `postinstall` fetches the models during the build.
3. Open the HTTPS URL on a phone.

## Project structure

```
src/app/                 pages: landing, /exam, /report, manifest
src/components/exam/     guided steps, camera, results, QR share, hospitals
src/components/report/   clinician handoff report
src/lib/scoring/         face, arm, speech, reported symptoms, risk engine (+ tests)
src/lib/                 report encoding, hospitals, i18n, vision loader, voice
src/eval/                synthetic robustness evaluation
scripts/                 asset setup, E2E smoke test, code export
public/sw.js             offline service worker
```

## Limitations

- **Not a medical device and not clinically validated.** Thresholds are provisional and must be calibrated on real
  patient data (e.g. Toronto NeuroFace for facial palsy, TORGO for dysarthric speech) before any clinical use.
- Speech transcription uses the browser's speech service, which in Chrome may process audio on Google's servers.
  Audio-level analysis stays on the device.
- Hindi and Tamil text should be reviewed by native-speaking clinicians.
- OpenStreetMap does not reliably mark stroke-capable hospitals; the app recommends calling an ambulance.

## Next steps

Clinical pilot with an emergency department to calibrate thresholds; eye-movement and gait tests from the camera;
direct integration with ambulance dispatch; more Indian languages.

---

StrokeSense is a screening aid and does not provide a diagnosis. If you suspect a stroke, call emergency services
immediately (India: 108 / 112).
