# StrokeSense â€” spot a stroke in 60 seconds, with just a phone

[![CI](https://github.com/sathiyanarayanan17/strokesense/actions/workflows/ci.yml/badge.svg)](https://github.com/sathiyanarayanan17/strokesense/actions/workflows/ci.yml)

StrokeSense is a browser app that guides a bystander through the **BE-FAST** stroke check (Balance, Eyes, Face,
Arms, Speech, Time). It uses on-device AI to *measure* the warning signs from the phone's camera and microphone,
tells the family clearly when to call an ambulance, and creates a handoff report the emergency team can scan.

Built for **DSH Hacks V2 â€” AI Ã— Healthcare**.

## The problem

During a stroke the brain loses about 1.9 million neurons every minute. Clot-dissolving treatment is mainly given
within about 4.5 hours of onset, yet many patients arrive late because the people around them do not recognise the
signs or wait to see if they pass. BE-FAST is easy to describe but hard for a frightened family member to apply.

## What it does

| Step | How it works |
|---|---|
| **T** â€“ Time | Records when the person was last seen well â€” the fact doctors need most. |
| **B** â€“ Balance | Bystander question **plus** a camera check: the person stands still with feet together for 10 s while MediaPipe Pose measures lateral sway (0.5 s low-pass to reject jitter), trunk lean and stepping. A safety step comes first; "cannot stand safely" is itself a warning sign. |
| **E** â€“ Eyes | Bystander question **plus** iris tracking: with the head still, the eyes follow a dot (large screens) or the bystander's finger (phones). We measure how far both eyes reach to each side (gaze palsy) and resting deviation. |
| **F** â€“ Face | MediaPipe Face Landmarker (478 points) runs on the device. We measure how far each mouth corner moves from rest to smile, in a face-aligned coordinate frame, so head tilt and distance don't matter. Frames with a turned head are rejected. |
| **A** â€“ Arms | MediaPipe Pose tracks both wrists against the shoulder line for 10 s with eyes closed â€” a camera version of the clinical pronator-drift test. Both arms tiring together is *not* counted as one-sided weakness. |
| **S** â€“ Speech | The person repeats the Cincinnati sentence. We combine word error rate, on-device pause analysis and the bystander's own judgement (a "yes, it sounded wrong" always counts). |
| **Result** | A deterministic rule: **any single warning sign â†’ call 108/112 now**. Each finding comes with the measurement behind it. |

After the check:

- **Handoff report + QR code** â€” a clinician-ready summary. The data is encoded in the link's `#fragment`, which
  browsers never send to a server, so nothing is uploaded or stored. Decoded data is validated as untrusted input.
- **Nearby hospitals** from OpenStreetMap, with distance, call and directions.
- **First-aid steps and a live clock** since the person was last seen well. The steps are fixed, conservative templates (no food, drink or aspirin; recovery position if drowsy), not generated text.
- **One-tap WhatsApp / SMS** with the report link and, if the user taps "Add my location", a maps link. The user chooses the recipient.
- **Larger text, high contrast, voice-guidance on/off and a country setting**, remembered on the device only. The emergency number (108/112 in India, 911, 999, 000 and others) follows the phone's time zone and language, and can be overridden. An Indian time zone always gives 108/112.
- **Practice mode** (`/practice`): the same guided flow with sharing turned off, for rehearsing on a calm day.
- **Install prompt** for the offline app, a **copy-message** fallback when WhatsApp or SMS is unavailable, and a **printable handoff report** with space for handwritten notes.
- **English, à¤¹à¤¿à¤¨à¥à¤¦à¥€, à®¤à®®à®¿à®´à¯** explanations for the family, with read-aloud.
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
Browser (Next.js 16 Â· React 19 Â· Tailwind 4)
â”œâ”€ Exam flow (state machine): Time â†’ Balance/Eyes â†’ Face â†’ Arms â†’ Speech â†’ Result
â”œâ”€ Vision: MediaPipe Tasks (WASM, GPUâ†’CPU fallback), one shared camera stream
â”‚   â”œâ”€ Face: face-aligned frame â†’ mouth-corner excursion asymmetry + droop
â”‚   â””â”€ Arms: wrist height vs shoulder line â†’ drift, slope, raise failure
â”œâ”€ Audio: Web Audio RMS â†’ voice activity & pauses Â· Web Speech API â†’ transcript â†’ WER
â”œâ”€ Scoring engine (pure TypeScript, unit-tested) â†’ BE-FAST findings â†’ risk tier
â”œâ”€ i18n templates (en / hi / ta) Â· speech synthesis
â”œâ”€ Report: base64url in URL fragment â†’ QR (qrcode) â†’ /report (validated decode, printable)
â””â”€ Service worker: offline pages + cached models
External (optional): OpenStreetMap Overpass API for hospital search
```

## Run it

Requires Node 20.9+ (tested on Node 24).

```bash
npm install          # also copies the MediaPipe WASM runtime and downloads the models (postinstall)
npm run dev          # http://localhost:3000 â€” use Chrome or Edge, allow camera & microphone
```

Camera access needs HTTPS or `localhost`. To try it on a phone, deploy (below) or use an HTTPS tunnel.

## Quality checks

```bash
npm test             # 86 unit tests: scoring maths, speech model parity, risk engine, report, hospitals, translations
npm run eval         # synthetic robustness evaluation â†’ docs/EVALUATION.md
npm run build && npm start   # then, in another terminal:
npm run e2e          # end-to-end test (incl. axe accessibility scan) in headless Edge with a fake camera (BROWSER=chrome to use Chrome)
npm run lint
cd python && pip install -e ".[dev]" && python -m pytest   # Python port of the scoring engine (75 tests, including parity with the TypeScript engine)
```

### Evaluation summary ([full report](docs/EVALUATION.md))

The real scoring engine was fed thousands of simulated exams with known ground truth plus phone-camera noise
(landmark jitter, head tilt, distance, low frame rate, tracking dropouts):

| Test | Condition | Sensitivity | Specificity |
|---|---|---|---|
| Face | Typical phone | 100.0% | 99.3% |
| Face | Hard (3 px jitter, Â±20Â° tilt) | 98.5% | 93.8% |
| Arms | Typical phone | 100.0% | 100.0% |
| Balance | Noisy camera (4 px jitter, 15 fps) | 100.0% | 99.0% |
| Eyes | Very noisy iris (3 px jitter) | 99.8% | 99.8% |

The evaluation earned its keep: its first run showed the balance check's sway-*velocity* measure flagged **every**
healthy simulated person on noisy cameras, so velocity was removed from the decision rule.

Mild cases near the thresholds are only partly detected (see severity curves in the report). **This is not clinical
validation**; it shows the measurement pipeline holds up under realistic noise.

## Deploy (Vercel)

1. Push this repository to GitHub.
2. Import it at vercel.com â†’ New Project. Defaults work; `postinstall` fetches the models during the build.
3. Open the HTTPS URL on a phone.

## Project structure

```
src/app/                 pages: landing, /exam, /report, manifest
src/components/exam/     guided steps, camera, results, QR share, hospitals
src/components/report/   clinician handoff report
src/lib/scoring/         face, arm, speech, reported symptoms, risk engine (+ tests)
src/lib/                 report encoding, hospitals, i18n, vision loader, voice
src/eval/                synthetic robustness evaluation
ml/                      speech-model training on TORGO (see docs/SPEECH_MODEL.md)
python/                  Python port of the scoring engine, with tests
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
