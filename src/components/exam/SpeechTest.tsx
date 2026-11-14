"use client";

import { useEffect, useRef, useState } from "react";
import { median } from "@/lib/math";
import { scoreSpeech, TARGET_SENTENCE, type BystanderAnswer, type EnergySample } from "@/lib/scoring/speech";
import type { TestResult } from "@/lib/scoring/types";
import { speak, stopSpeaking } from "@/lib/voice";
import { PhaseTimer } from "./CameraStage";
import { TestShell } from "./TestShell";

// Minimal typings for the Web Speech API (not in TypeScript's DOM lib).
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Stage = "ready" | "calibrating" | "prompting" | "listening" | "ask";

const CALIBRATE_MS = 1000;
const LISTEN_MS = 7000;

export function SpeechTest({ onComplete }: { onComplete: (r: TestResult) => void }) {
  const [stage, setStage] = useState<Stage>("ready");
  const [transcript, setTranscript] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recognitionAvailable, setRecognitionAvailable] = useState(true);

  // Capture state lives in refs so the audio loop never re-renders per sample.
  const energy = useRef<EnergySample[]>([]);
  const noise = useRef<number[]>([]);
  const finalTranscript = useRef<string | null>("");
  const cleanup = useRef<(() => void) | null>(null);
  const stageRef = useRef<Stage>("ready");

  useEffect(() => () => cleanup.current?.(), []);

  function go(s: Stage) {
    stageRef.current = s;
    setStage(s);
  }

  async function start() {
    setError(null);
    setTranscript("");
    energy.current = [];
    noise.current = [];
    finalTranscript.current = "";

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Microphone permission was denied. Allow microphone access, or answer the question below.");
      go("ask");
      return;
    }

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const t0 = performance.now();
    let raf = 0;
    let lastUi = 0;

    const sample = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const t = performance.now() - t0;
      if (stageRef.current === "calibrating") noise.current.push(rms);
      else if (stageRef.current === "listening") energy.current.push({ t, rms });
      if (t - lastUi > 80) {
        lastUi = t;
        setLevel(Math.min(1, rms * 8));
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);

    const Ctor = getRecognitionCtor();
    let recognition: Recognition | null = null;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const stopAll = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(finishTimer);
      recognition?.abort();
      stream.getTracks().forEach((tr) => tr.stop());
      void audioCtx.close();
    };
    cleanup.current = stopAll;

    const finish = () => {
      if (stageRef.current !== "listening") return;
      stopAll();
      go("ask");
      speak("Did their speech sound slurred or strange?");
    };

    // Only starts once the spoken prompt has finished, so the app never
    // measures or transcribes its own voice.
    const beginListening = () => {
      if (stopped || stageRef.current !== "prompting") return;
      go("listening");

      if (Ctor) {
        recognition = new Ctor();
        recognition.lang = "en-US";
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
          let text = "";
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
          finalTranscript.current = text;
          setTranscript(text);
        };
        recognition.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "network") {
            finalTranscript.current = null;
            setRecognitionAvailable(false);
          }
        };
        // Recognition stops by itself after the person finishes talking.
        recognition.onend = () => setTimeout(finish, 300);
        try {
          recognition.start();
        } catch {
          finalTranscript.current = null;
          setRecognitionAvailable(false);
        }
      } else {
        finalTranscript.current = null;
        setRecognitionAvailable(false);
      }
      finishTimer = setTimeout(finish, LISTEN_MS);
    };

    go("calibrating");
    stopSpeaking();
    setTimeout(() => {
      if (stopped || stageRef.current !== "calibrating") return;
      go("prompting");
      speak(`Please repeat: ${TARGET_SENTENCE}`, () => setTimeout(beginListening, 250), 6000);
    }, CALIBRATE_MS);
  }

  function answer(bystander: BystanderAnswer) {
    cleanup.current?.();
    const result = scoreSpeech({
      transcript: finalTranscript.current,
      energy: energy.current,
      noiseFloor: noise.current.length ? median(noise.current) : 0,
      bystander,
    });
    onComplete(result);
  }

  return (
    <TestShell
      letter="S"
      title="Speech"
      description="The person repeats a short sentence. We check for wrong words, slurring and unusual pauses, and ask you what you heard."
      instructions={[
        "Find a quiet spot and hold the phone close.",
        "Stay quiet for a second while we measure background noise.",
        `Ask the person to repeat: "${TARGET_SENTENCE}".`,
      ]}
    >
      <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
        <p className="text-center text-sm uppercase tracking-wide text-slate-400">Sentence to repeat</p>
        <p className="mt-2 text-center text-2xl font-bold sm:text-3xl">&ldquo;{TARGET_SENTENCE}&rdquo;</p>

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3" aria-hidden>
            <span className="w-20 text-sm text-slate-400">Mic level</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
            </div>
          </div>
          {stage === "calibrating" && (
            <>
              <p className="text-center text-lg" aria-live="assertive">Stay quiet… measuring background noise</p>
              <PhaseTimer ms={CALIBRATE_MS} phaseKey="cal" />
            </>
          )}
          {stage === "prompting" && (
            <p className="text-center text-lg" aria-live="assertive">Listen to the instruction…</p>
          )}
          {stage === "listening" && (
            <>
              <p className="text-center text-lg font-semibold" aria-live="assertive">Listening — say the sentence now</p>
              <PhaseTimer ms={LISTEN_MS} phaseKey="listen" />
            </>
          )}
          {(stage === "listening" || stage === "ask") && (
            <p className="min-h-8 text-center text-lg text-sky-200" aria-live="polite">
              {transcript ? `Heard: "${transcript}"` : recognitionAvailable ? "" : "Automatic transcription unavailable — your answer below will be used."}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-center text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col items-center gap-3">
        {stage === "ready" && (
          <button
            type="button"
            onClick={start}
            className="rounded-full bg-rose-600 px-8 py-3 text-lg font-semibold text-white shadow transition hover:bg-rose-700"
          >
            Start speech check
          </button>
        )}
        {stage === "ask" && (
          <fieldset className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <legend className="px-2 font-semibold text-slate-900">Did their speech sound slurred, strange, or were words wrong?</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => answer("yes")} className="rounded-xl bg-rose-600 py-3 font-semibold text-white hover:bg-rose-700">
                Yes
              </button>
              <button type="button" onClick={() => answer("no")} className="rounded-xl bg-slate-800 py-3 font-semibold text-white hover:bg-slate-900">
                No
              </button>
              <button type="button" onClick={() => answer("unsure")} className="rounded-xl bg-slate-200 py-3 font-semibold text-slate-900 hover:bg-slate-300">
                Not sure
              </button>
            </div>
          </fieldset>
        )}
        <p className="max-w-md text-center text-xs text-slate-500">
          Audio levels are analysed on this device. Word transcription uses your browser&apos;s built-in speech service.
        </p>
      </div>
    </TestShell>
  );
}
