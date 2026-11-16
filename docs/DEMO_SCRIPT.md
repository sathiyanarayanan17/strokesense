# Demo video script (target: 2 min 45 s)

Record the screen with OBS or the Windows Game Bar (Win+Alt+R). Use the **deployed HTTPS link on a phone** for the
live parts if you can, mirrored to the laptop (or film the phone). Speak slowly. Keep the camera parts real — judges
value a working demo over slides.

| Time | On screen | What you say |
|---|---|---|
| 0:00–0:20 | Title card, then a stroke statistic | "Every minute during a stroke, the brain loses about 1.9 million neurons. Clot-dissolving treatment mainly works within about four and a half hours — but many people reach hospital too late, because the family didn't recognise the signs. Doctors use the BE-FAST test. A frightened relative can't." |
| 0:20–0:35 | Landing page | "StrokeSense turns any phone into a guided, 60-second stroke check. No app to install, and no video ever leaves the phone." |
| 0:35–0:50 | Time + Balance/Eyes steps | "First it records when the person was last seen well — the single most important fact for the hospital. Then balance and eyes: the camera measures sway, lean and stepping while the person stands, and iris tracking checks that both eyes follow a dot to each side. The bystander's own answer is always combined, and a yes always counts." |
| 0:50–1:20 | **Face check, live.** Do one normal smile, then retry and smile with only one side (keep the other side relaxed). | "On-device face tracking follows 478 points. We measure how far each corner of the mouth moves from rest to smile, in a coordinate frame aligned to the face, so tilting the head doesn't fool it. Watch — when I smile with one side only, it catches it and names the weaker side." |
| 1:20–1:50 | **Arm check, live.** Raise both arms, then let one arm slowly sink. Point at the live meters. | "This is the clinical arm-drift test, done with body tracking. Eyes closed, arms out for ten seconds. When one arm sinks, it's flagged. If both arms tire together, it is *not* — that's fatigue, not one-sided weakness." |
| 1:50–2:05 | Speech check | "The person repeats a standard sentence. We check word errors and pauses — and we always ask the bystander. A human 'yes, that sounded wrong' always counts." |
| 2:05–2:25 | Results: red banner, call button, Tamil/Hindi toggle, read aloud | "One clear answer: any warning sign means call 108 now — the same rule paramedics use. Every finding shows its measurement. It explains the result in English, Hindi or Tamil, and reads it aloud." |
| 2:25–2:40 | QR code → scan with second phone → report; hospitals list | "The ambulance crew scans this QR code and gets a clinical handoff report. The data lives inside the link itself, so nothing is uploaded or stored. And it finds the nearest hospitals." |
| 2:40–2:55 | README evaluation table / terminal running `npm test` and `python -m pytest` | "We tested the scoring engine on thousands of simulated exams with camera noise — and we're honest that clinical validation is the next step. StrokeSense: because in a stroke, time is brain." |

## Tips

- Practise the one-sided smile and arm sink before recording.
- Good front lighting; plain background; whole upper body in frame for the arm test.
- If something fails on camera, keep going — show the "Retry camera" / inconclusive handling. It proves the safety design.
- Upload to YouTube as **Unlisted** and paste the link into Devpost.
